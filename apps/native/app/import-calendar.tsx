import { api } from "@life-os/backend/convex/_generated/api";
import { useAction } from "convex/react";
import { useRouter } from "expo-router";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function ImportCalendar() {
  const router = useRouter();
  const calendarImportApi = api as unknown as {
    calendarImport: { importFromIcsUrl: any };
  };
  const importAction = useAction(calendarImportApi.calendarImport.importFromIcsUrl);

  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) {
      setError("Paste a public https:// ICS URL.");
      return;
    }

    setError(null);
    setIsImporting(true);
    try {
      const response = await importAction({ url: trimmed });
      setResult({
        imported: Number(response?.imported ?? 0),
        skipped: Number(response?.skipped ?? 0),
      });
      setToastMessage("Import completed.");
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => {
        setToastMessage(null);
      }, 900);
    } catch (err) {
      setError("Import failed. Check the URL and try again.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-primary/20 pb-2">
          <View>
            <MachineText variant="label" className="text-primary mb-1">
              CALENDAR_IMPORT
            </MachineText>
            <MachineText variant="header" size="2xl">
              IMPORT_ICS
            </MachineText>
          </View>
        </View>

        <HardCard label="SOURCE_URL" className="mb-6">
          <View className="gap-4 p-4">
            <MachineText className="text-xs text-foreground/70">
              Paste a public ICS URL. Busy events become blocks.
            </MachineText>
            <View className="bg-white border border-black/20 p-1">
              <TextField>
                <TextField.Input
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://calendar.example.com/public.ics"
                  placeholderTextColor="#999"
                  className="font-mono text-sm h-8"
                  style={{ fontFamily: "Menlo" }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </TextField>
            </View>
            {error ? (
              <MachineText className="text-xs text-red-600">{error}</MachineText>
            ) : null}
          </View>
        </HardCard>

        <HardCard label="ACTION" className="mb-6">
          <View className="gap-3 p-4">
            <Button
              className="bg-primary border border-black shadow-[2px_2px_0px_black]"
              onPress={submit}
              isDisabled={isImporting}
            >
              {isImporting ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-white font-bold">IMPORT</MachineText>
              )}
            </Button>
            <Button
              className="bg-white border border-black shadow-[2px_2px_0px_black]"
              onPress={() => router.back()}
            >
              <MachineText className="text-black font-bold">CLOSE</MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: reality should match your actual calendar.
            </MachineText>
          </View>
        </HardCard>

        {result ? (
          <HardCard label="RESULT">
            <View className="gap-2 p-4">
              <MachineText className="text-sm">
                IMPORTED: {result.imported}
              </MachineText>
              <MachineText className="text-sm">
                SKIPPED: {result.skipped}
              </MachineText>
            </View>
          </HardCard>
        ) : null}
      </ScrollView>
      {toastMessage ? (
        <View className="absolute bottom-6 left-4 right-4">
          <View className="bg-black px-3 py-2 border border-black shadow-[2px_2px_0px_black]">
            <MachineText className="text-white text-xs">{toastMessage}</MachineText>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
