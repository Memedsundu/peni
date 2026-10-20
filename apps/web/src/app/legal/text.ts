/**
 * Gizlilik (KVKK aydınlatma metni) and Kullanım koşulları (plan piece 34). Plain words, the
 * same in both languages. Who the data controller is comes from the environment
 * (PENI_LEGAL_NAME, PENI_LEGAL_ADDRESS, PENI_CONTACT_EMAIL), so the text needs no edit when
 * the company details are in. See docs/kvkk.md for what to check before launch.
 */

export type LegalLang = "tr" | "en";
export interface LegalSection {
  h: string;
  p: string[];
}
export interface LegalDoc {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export interface Controller {
  name: string;
  address: string | null;
  email: string | null;
}

export const LEGAL_UPDATED = { tr: "19 Ekim 2026", en: "19 October 2026" };

export function controllerFromEnv(): Controller {
  return {
    name: process.env.PENI_LEGAL_NAME?.trim() || "Peni",
    address: process.env.PENI_LEGAL_ADDRESS?.trim() || null,
    email: process.env.PENI_CONTACT_EMAIL?.trim() || null,
  };
}

const PROVIDERS = {
  tr: [
    "Vercel Inc. (ABD): sitenin ve uygulamanın sunucuları, Frankfurt'ta.",
    "Neon Inc. (ABD): veritabanı, Frankfurt'ta.",
    "Resend (ABD): giriş kodu ve bildirim e-postaları.",
    "Anthropic PBC (ABD): yalnızca kafe panelindeki asistan (Claude); kafenin yüklediği belgeler ve ekibin sorduğu sorular kafenin kayıtlarıyla birlikte işlenir.",
    "OpenAI (ABD): yalnızca kafe ekibinin sesli hızlı girişi açıksa, söyleneni yazıya çevirmek için; kayıt saklanmaz.",
    "Google ve Apple: onlarla giriş yaparsan, kim olduğunu doğrulamak için.",
  ],
  en: [
    "Vercel Inc. (USA): the servers for the site and the app, in Frankfurt.",
    "Neon Inc. (USA): the database, in Frankfurt.",
    "Resend (USA): sign-in codes and notification emails.",
    "Anthropic PBC (USA): only the assistant in the café panel (Claude); documents the café uploads and questions its team asks are processed with the café's records.",
    "OpenAI (USA): only when a café team uses spoken quick entry, to turn what was said into text; the recording isn't kept.",
    "Google and Apple: if you sign in with them, to confirm who you are.",
  ],
};

export function privacy(lang: LegalLang, c: Controller): LegalDoc {
  const contact = [c.name, c.address, c.email].filter(Boolean).join(" · ");
  if (lang === "en")
    return {
      title: "Privacy",
      updated: `Last updated ${LEGAL_UPDATED.en}`,
      intro: `This notice explains, as Turkey's data protection law (KVKK, No. 6698) asks, what Penny keeps about you, why, who sees it and what you can ask for. The data controller is ${contact}.`,
      sections: [
        {
          h: "What we keep",
          p: [
            "If you use Penny as a customer: your name as you write it, your email, the id Google or Apple gives us if you sign in with them, your phone number if you gave one, the cafés you joined, the penny you earned, spent and sent, what you left on or took from the askı, your posts, comments and the events you said you'd go to, and your phone's notification key.",
            "If you work at a café: your name, email, your password and till PIN (only as unreadable hashes), your shifts, hours, pay and what was paid to you.",
            "For the café itself: its sales, bills, suppliers, money and stock, and the documents it uploads.",
          ],
        },
        {
          h: "Why",
          p: [
            "To give you the service: your account, your penny at each café, treats, the askı and the café's feed (KVKK art. 5/2-c).",
            "Because the law asks it: cafés keep their sales and bills for their books (art. 5/2-ç).",
            "To keep Penny safe: limiting sign-in attempts and stopping abuse (art. 5/2-f).",
            "Your profile is hidden from other members until you turn it on.",
          ],
        },
        {
          h: "Who sees it",
          p: [
            "A café you joined sees your name, your penny and askı activity there, and what you post there. Other members see your name only if your profile is visible, and only your initials on events.",
            "Other members are never shown who took from the askı. Müdavimler and other café reports show counts, never names.",
            "We use these providers, some of them abroad (KVKK art. 9):",
            ...PROVIDERS.en,
            "We don't sell your data or use it for advertising. There are no tracking or advertising cookies.",
          ],
        },
        {
          h: "How long",
          p: [
            "While your account is open. When you delete it, your name, email, phone, photo and sign-ins are deleted straight away and you are signed out everywhere. What cafés need for their books (penny earned and spent, treats, the askı) stays under the name “Deleted member”.",
            "Café records are kept for as long as tax law asks.",
          ],
        },
        {
          h: "Your rights",
          p: [
            "Under KVKK art. 11 you can ask whether and how your data is processed, have it corrected or deleted, learn who it was shared with, and object.",
            "In the app under Me, or on the Account page of the site, you can download everything we keep about you and delete your account yourself.",
            c.email ? `For anything else, write to ${c.email}. We answer within 30 days.` : "For anything else, ask the café or reach us through the app.",
          ],
        },
        {
          h: "Cookies and your device",
          p: ["One cookie keeps you signed in. Your browser also remembers your language and light or dark mode. Nothing else."],
        },
      ],
    };
  return {
    title: "Gizlilik",
    updated: `Son güncelleme ${LEGAL_UPDATED.tr}`,
    intro: `Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) gereği Penny'nin senin hakkında neyi, neden tuttuğunu, kimin gördüğünü ve neler isteyebileceğini anlatır. Veri sorumlusu: ${contact}.`,
    sections: [
      {
        h: "Ne tutuyoruz",
        p: [
          "Penny'yi müşteri olarak kullanıyorsan: yazdığın adın, e-postan, Google ya da Apple ile girdiysen onların verdiği kimlik, verdiysen telefon numaran, katıldığın kafeler, kazandığın, harcadığın ve ısmarladığın penny, askıya bıraktığın ya da askıdan aldığın, gönderilerin, yorumların, katılacağını söylediğin etkinlikler ve telefonunun bildirim anahtarı.",
          "Bir kafede çalışıyorsan: adın, e-postan, şifren ve kasa PIN'in (yalnızca okunamaz biçimde), vardiyaların, çalışma saatlerin, ücretin ve sana yapılan ödemeler.",
          "Kafenin kendisi için: satışları, faturaları, tedarikçileri, parası, stoku ve yüklediği belgeler.",
        ],
      },
      {
        h: "Neden",
        p: [
          "Hizmeti verebilmek için: hesabın, her kafedeki penny'n, ısmarlamalar, askı ve kafenin akışı (KVKK m. 5/2-c).",
          "Kanun istediği için: kafeler satış ve faturalarını defterleri için saklar (m. 5/2-ç).",
          "Penny'yi güvende tutmak için: giriş denemelerini sınırlamak, kötüye kullanımı durdurmak (m. 5/2-f).",
          "Profilin, sen açana kadar diğer üyelerden gizlidir.",
        ],
      },
      {
        h: "Kim görüyor",
        p: [
          "Katıldığın kafe adını, oradaki penny ve askı hareketlerini ve orada paylaştıklarını görür. Diğer üyeler adını yalnızca profilin açıksa görür; etkinliklerde yalnızca baş harflerin görünür.",
          "Askıdan kimin aldığı diğer üyelere gösterilmez. Müdavimler ve kafenin diğer raporları isim değil, sayı gösterir.",
          "Şu hizmet sağlayıcılarla çalışıyoruz; bazıları yurt dışında (KVKK m. 9):",
          ...PROVIDERS.tr,
          "Verini satmayız, reklam için kullanmayız. İzleme ya da reklam çerezi yoktur.",
        ],
      },
      {
        h: "Ne kadar",
        p: [
          "Hesabın açık olduğu sürece. Hesabını silince adın, e-postan, telefonun, fotoğrafın ve giriş bilgilerin hemen silinir, her yerden çıkış yapılır. Kafelerin defterleri için gereken hareketler (kazanılan ve harcanan penny, ısmarlamalar, askı) “Silinmiş üye” adıyla kalır.",
          "Kafe kayıtları vergi mevzuatının istediği süre boyunca saklanır.",
        ],
      },
      {
        h: "Hakların",
        p: [
          "KVKK m. 11 gereği verinin işlenip işlenmediğini ve nasıl işlendiğini sorabilir, düzeltilmesini ya da silinmesini isteyebilir, kimlerle paylaşıldığını öğrenebilir, itiraz edebilirsin.",
          "Uygulamada Ben sekmesinde ya da sitedeki Hesabım sayfasında hakkında tuttuğumuz her şeyi indirebilir, hesabını kendin silebilirsin.",
          c.email
            ? `Başka her şey için ${c.email} adresine yaz. 30 gün içinde yanıtlarız.`
            : "Başka her şey için kafeye sorabilir ya da uygulamadan bize ulaşabilirsin.",
        ],
      },
      {
        h: "Çerezler ve cihazın",
        p: ["Oturumunu açık tutan tek bir çerez var. Tarayıcın ayrıca dilini ve açık ya da koyu görünümü hatırlar. Başka bir şey yok."],
      },
    ],
  };
}

export function terms(lang: LegalLang, c: Controller): LegalDoc {
  if (lang === "en")
    return {
      title: "Terms of use",
      updated: `Last updated ${LEGAL_UPDATED.en}`,
      intro: `Penny is run by ${c.name}. By using it you agree to these terms.`,
      sections: [
        {
          h: "What pennies is",
          p: [
            "Penny is a thank-you from a café you visit. 1 pennies is worth ₺1, only at the café where you earned it, towards what you buy there.",
            "Penny isn't money: it can't be paid out in cash, moved to another café, or earn interest. Each café decides how much pennies it gives and which items it can be spent on, and may change that.",
          ],
        },
        {
          h: "Treats and the askı",
          p: [
            "You can treat another member of the same café to pennies. A treat not accepted in time goes back to you.",
            "What you leave on the askı is a gift to whoever takes it next and can't be taken back.",
          ],
        },
        {
          h: "Being a good neighbour",
          p: [
            "Write as you would at the café's table: no spam, insults, harassment or anything illegal. The café can hide posts and comments and stop someone from posting.",
            "Events members open are their own; the café isn't the organiser unless it says so.",
          ],
        },
        {
          h: "Your account",
          p: [
            "Keep your sign-in to yourself. You can delete your account at any time on the Account page; pennies left at cafés is then given up.",
            "We may close an account that is used to cheat a café or other members.",
          ],
        },
        {
          h: "Responsibility",
          p: [
            "Cafés are responsible for what they sell and for honouring the pennies they gave. We work to keep Penny running and correct, but can't promise it will never be down.",
            "Turkish law applies. Consumers can turn to consumer arbitration committees and consumer courts.",
          ],
        },
      ],
    };
  return {
    title: "Kullanım koşulları",
    updated: `Son güncelleme ${LEGAL_UPDATED.tr}`,
    intro: `Penny'yi ${c.name} işletir. Penny'yi kullanarak bu koşulları kabul etmiş olursun.`,
    sections: [
      {
        h: "Penny nedir",
        p: [
          "Penny, gittiğin kafenin sana teşekkürüdür. 1 penny ₺1 değerindedir; yalnızca kazandığın kafede, oradan aldıklarında geçer.",
          "Penny para değildir: nakde çevrilmez, başka kafeye taşınmaz, faiz getirmez. Ne kadar penny verileceğine ve hangi ürünlerde harcanacağına her kafe kendisi karar verir ve bunu değiştirebilir.",
        ],
      },
      {
        h: "Ismarlamak ve askı",
        p: [
          "Aynı kafenin başka bir üyesine penny ısmarlayabilirsin. Süresinde kabul edilmeyen ısmarlama sana geri döner.",
          "Askıya bıraktığın, sonraki alan için bir hediyedir; geri alınmaz.",
        ],
      },
      {
        h: "İyi komşuluk",
        p: [
          "Kafenin masasında konuşur gibi yaz: reklam, hakaret, taciz ya da yasa dışı bir şey olmasın. Kafe gönderi ve yorumları gizleyebilir, birinin yazmasını durdurabilir.",
          "Üyelerin açtığı etkinlikler kendilerinindir; kafe aksini söylemedikçe düzenleyen değildir.",
        ],
      },
      {
        h: "Hesabın",
        p: [
          "Giriş bilgilerini kimseyle paylaşma. Hesabını istediğin zaman Hesabım sayfasından silebilirsin; o zaman kafelerde kalan penny'n de silinir.",
          "Bir kafeyi ya da diğer üyeleri kandırmak için kullanılan hesabı kapatabiliriz.",
        ],
      },
      {
        h: "Sorumluluk",
        p: [
          "Kafeler sattıklarından ve verdikleri penny'nin karşılığından sorumludur. Penny'nin çalışır ve doğru olması için uğraşırız; hiç kesinti olmayacağını söz veremeyiz.",
          "Türk hukuku uygulanır. Tüketiciler tüketici hakem heyetlerine ve tüketici mahkemelerine başvurabilir.",
        ],
      },
    ],
  };
}
