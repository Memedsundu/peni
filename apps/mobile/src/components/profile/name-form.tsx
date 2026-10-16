/**
 * "Adın" + "Kaydet" on Profil [G18] (§9.8, §10.7): the field and a secondary "Kaydet" side by
 * side, the hint "Siparişin hazır olunca bu adla çağrılırsın." under them. A save turns the hint
 * into "Kaydedildi." with a check (icon + word); a failure is the field's own error, and the
 * typed name stays.
 */
import { PeniApiError, type MeDTO, type PeniClient } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { Check, CircleAlert } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Icon, Input, T } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useTokens } from "@/lib/theme";

export const NAME_HINT = "Siparişin hazır olunca bu adla çağrılırsın.";
export const NAME_EMPTY = "Adını yazar mısın?";
const SAVED = "Kaydedildi.";

export function NameForm({ api, initial, onSaved }: { api: PeniClient; initial: string; onSaved: (me: MeDTO) => void }) {
  const t = useTokens();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (status === "saving") return;
    const name = value.trim();
    if (!name) {
      haptic("error");
      setError(NAME_EMPTY);
      return;
    }
    if (name === saved) {
      setValue(name);
      setStatus("saved");
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const me = await api.me.updateProfile({ displayName: name });
      setSaved(me.customer.displayName);
      setValue(me.customer.displayName);
      setStatus("saved");
      haptic("success");
      onSaved(me);
    } catch (e) {
      haptic("error");
      setStatus("idle");
      setError(
        e instanceof PeniApiError && e.code === "NETWORK"
          ? errorCopy.network
          : e instanceof PeniApiError
            ? e.message
            : errorCopy.change,
      );
    }
  };

  return (
    <View style={styles.frame}>
      <T variant="strong" aria-hidden>
        Adın
      </T>
      <View style={styles.row}>
        <Input
          value={value}
          onChangeText={(v) => {
            setValue(v);
            if (status === "saved") setStatus("idle");
            if (error) setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          maxLength={40}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          invalid={!!error}
          accessibilityLabel="Adın"
          accessibilityHint={error ?? NAME_HINT}
          style={styles.input}
        />
        <Button
          variant="secondary"
          title={actionCopy.save}
          loading={status === "saving"}
          loadingLabel="Kaydediliyor…"
          onPress={() => void submit()}
        />
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.note}>
          <View style={styles.noteIcon}>
            <Icon icon={CircleAlert} size={16} color={t.danger} />
          </View>
          <T variant="meta" color="danger" style={styles.noteText}>
            {error}
          </T>
        </View>
      ) : status === "saved" ? (
        <View accessibilityLiveRegion="polite" style={styles.note}>
          <View style={styles.noteIcon}>
            <Icon icon={Check} size={16} color={t.successInk} />
          </View>
          <T variant="meta" color="successInk" style={styles.noteText}>
            {SAVED}
          </T>
        </View>
      ) : (
        <T variant="meta" color="ink2" aria-hidden>
          {NAME_HINT}
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  input: { flex: 1, minWidth: 0 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteIcon: { paddingTop: 1 },
  noteText: { flex: 1 },
});
