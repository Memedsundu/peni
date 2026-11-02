import { hostname } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import pkg from "../package.json" with { type: "json" };
import { homeDir, loadConfig, saveConfig, type BridgeConfig } from "./config";
import { IngenicoDriver } from "./drivers/ingenico";
import { SimulatorDriver } from "./drivers/simulator";
import type { TerminalDriver } from "./drivers/types";
import { Journal } from "./journal";
import { HttpLink, LinkError } from "./link";
import { Runner } from "./runner";

const HELP = `Penny Köprü ${pkg.version}: kasadaki bilgisayarın yazarkasasını Penny'ye bağlar.

  penny-kopru                    Bağlıysa çalışır; değilse Cihazlar sayfasındaki kodu sorar.
  penny-kopru bagla KOD          Bu bilgisayarı Cihazlar sayfasındaki kodla bağlar.
  penny-kopru calistir           Penny'den iş bekler ve yazarkasaya iletir.
  penny-kopru durum              Bağlantıyı ve yazarkasayı gösterir.
  penny-kopru surucu deneme      Deneme yazarkasasını kullanır.
  penny-kopru surucu ingenico --ip 192.168.1.25 --port 7777
                                 Ingenico'yu kullanır (belgeler gelince çalışacak).

  --sunucu ADRES                 Penny'nin adresi. Varsayılan ${loadConfig().server}
Komutların İngilizcesi de olur: pair, run, status, driver.`;

const log = (line: string) => console.log(`[${new Date().toLocaleTimeString("tr-TR")}] ${line}`);

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function driverFor(config: BridgeConfig, dir: string): TerminalDriver {
  if (config.driver === "ingenico") return new IngenicoDriver(config.ingenico);
  return new SimulatorDriver({ dir, speed: config.simulator.speed, paperOut: config.simulator.paperOut });
}

async function pair(config: BridgeConfig, code: string): Promise<BridgeConfig> {
  const answer = await new HttpLink(config.server, null).pair(code, hostname());
  const next = { ...config, token: answer.token, cafe: answer.cafe.name, device: answer.device.name };
  saveConfig(next);
  log(`Bağlandı: ${answer.cafe.name} · ${answer.device.name}`);
  return next;
}

async function run(config: BridgeConfig): Promise<void> {
  const dir = homeDir();
  const driver = driverFor(config, dir);
  const runner = new Runner({ link: new HttpLink(config.server, config.token), driver, journal: new Journal(join(dir, "journal.jsonl")), version: pkg.version, log });
  const status = await runner.status();
  log(`${config.cafe ?? "?"} · ${config.device ?? "?"} · ${config.server}`);
  log(`Yazarkasa: ${status.model ?? driver.name}${status.serial ? ` (${status.serial})` : ""} · ${status.ready ? "hazır" : `hazır değil: ${status.message}`}`);
  if (driver.name === "simulator") log("Bu bir deneme yazarkasası: fişleri mali değildir.");
  log("Penny'den iş bekleniyor. Kapatmak için Ctrl+C.");
  const stop = new AbortController();
  process.on("SIGINT", () => {
    if (stop.signal.aborted) process.exit(1);
    log("Kapanıyor; elindeki iş bitince duracak. Hemen kapatmak için yine Ctrl+C.");
    stop.abort();
  });
  await runner.run(stop.signal);
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv.filter((a, i) => !(a === "--sunucu" || argv[i - 1] === "--sunucu"));
  let config = loadConfig();
  const server = flag(argv, "--sunucu");
  if (server) config = { ...config, server };

  switch (command) {
    case undefined: {
      if (!config.token) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const code = await rl.question("Penny'nin Cihazlar sayfasındaki kodu yazın: ");
        rl.close();
        config = await pair(config, code);
      }
      return run(config);
    }
    case "bagla":
    case "pair":
      if (!rest[0]) throw new Error("Kodu da yazın: penny-kopru bagla ABCD-EFGH");
      await pair(config, rest[0]);
      return;
    case "calistir":
    case "run":
      if (!config.token) throw new Error("Önce bağlayın: penny-kopru bagla KOD");
      return run(config);
    case "durum":
    case "status": {
      const status = await driverFor(config, homeDir()).status();
      console.log(`Penny: ${config.server}\nBağlı: ${config.token ? `${config.cafe} · ${config.device}` : "hayır"}`);
      console.log(`Yazarkasa: ${status.model ?? config.driver}${status.serial ? ` (${status.serial})` : ""} · ${status.ready ? "hazır" : `hazır değil: ${status.message}`}`);
      console.log(`Ayarlar: ${homeDir()}`);
      return;
    }
    case "surucu":
    case "driver": {
      const which = rest[0] === "ingenico" ? "ingenico" : rest[0] === "deneme" || rest[0] === "simulator" ? "simulator" : null;
      if (!which) throw new Error("deneme ya da ingenico yazın.");
      const ip = flag(argv, "--ip");
      const port = flag(argv, "--port");
      const com = flag(argv, "--com");
      saveConfig({
        ...config,
        driver: which,
        ingenico: com ? { connection: "serial", path: com } : { connection: "tcp", host: ip ?? config.ingenico.host, port: port ? Number(port) : config.ingenico.port },
      });
      log(`Sürücü: ${which === "simulator" ? "deneme yazarkasası" : "Ingenico"}. Penny Köprü'yü yeniden başlatın.`);
      return;
    }
    default:
      console.log(HELP);
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof LinkError && error.status === 401) {
    console.error("Bu köprünün bağlantısı kaldırılmış. Cihazlar sayfasından yeni kod alıp yeniden bağlayın: penny-kopru bagla KOD");
  } else if (error instanceof LinkError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
