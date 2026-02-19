import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Button, Spinner, TextField } from "heroui-native";
import { useMemo, useState } from "react";
import { View, Text, ScrollView, Alert, Modal, Pressable } from "react-native";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { getTimezoneOffsetMinutes } from "@/lib/date";
import { EXPENSE_CATEGORIES, useAddExpense, useSetBudget, useFinancialData } from "@/lib/finance";

function CategoryBar({
  category,
  spent,
  budget,
}: {
  category: string;
  spent: number;
  budget: number;
}) {
  const percent = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const isOver = spent > budget && budget > 0;
  const isNear = percent >= 80 && percent < 100;

  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <MachineText variant="label" className="text-[10px] uppercase">
          {category}
        </MachineText>
        <MachineText variant="label" className="text-[10px]">
          ${spent.toFixed(0)} / ${budget > 0 ? `$${budget}` : "—"}
        </MachineText>
      </View>
      <View className="h-2 bg-muted border border-divider">
        <View
          className={`h-full ${isOver ? "bg-danger" : isNear ? "bg-warning" : "bg-success"}`}
          style={{ width: `${percent}%` }}
        />
      </View>
    </View>
  );
}

function AddExpenseModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const addExpense = useAddExpense();

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      await addExpense(amt, category, note || undefined);
      setAmount("");
      setNote("");
      onClose();
    } catch (e) {
      Alert.alert("Error", "Failed to add expense");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-surface border-t-2 border-divider p-5">
          <MachineText className="text-lg font-bold mb-4">ADD EXPENSE</MachineText>

          <View className="mb-3">
            <View className="bg-surface border border-divider p-1">
              <TextField>
                <TextField.Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Amount"
                  keyboardType="numeric"
                  className="font-mono text-sm h-8"
                />
              </TextField>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2 mb-3">
            {EXPENSE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                className={`px-3 py-1 border ${
                  category === cat ? "bg-primary border-primary" : "border-divider"
                }`}
              >
                <Text className={category === cat ? "text-primary-foreground" : "text-foreground"}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="mb-4">
            <View className="bg-surface border border-divider p-1">
              <TextField>
                <TextField.Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (optional)"
                  className="font-mono text-sm h-8"
                />
              </TextField>
            </View>
          </View>

          <View className="flex-row gap-2">
            <Button variant="ghost" onPress={onClose} className="flex-1">
              <Button.Label>Cancel</Button.Label>
            </Button>
            <Button onPress={handleSubmit} isDisabled={loading} className="flex-1">
              <Button.Label>{loading ? "..." : "Add"}</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SetBudgetModal({
  visible,
  onClose,
  initialCategory = "food",
}: {
  visible: boolean;
  onClose: () => void;
  initialCategory?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const setBudget = useSetBudget();
  const data = useFinancialData();

  const currentBudget = useMemo(() => {
    return data?.budgets?.find((b) => b.category === category)?.monthlyLimit || 0;
  }, [data, category]);

  const handleSubmit = async () => {
    const amt = parseFloat(limit);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid budget limit");
      return;
    }
    setLoading(true);
    try {
      await setBudget(category, amt);
      setLimit("");
      onClose();
    } catch (e) {
      Alert.alert("Error", "Failed to set budget");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-surface border-t-2 border-divider p-5">
          <MachineText className="text-lg font-bold mb-4">SET BUDGET</MachineText>

          <View className="flex-row flex-wrap gap-2 mb-3">
            {EXPENSE_CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                className={`px-3 py-1 border ${
                  category === cat ? "bg-primary border-primary" : "border-divider"
                }`}
              >
                <Text className={category === cat ? "text-primary-foreground" : "text-foreground"}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>

          {currentBudget > 0 && (
            <MachineText variant="label" className="text-[10px] mb-3">
              Current: ${currentBudget}/month
            </MachineText>
          )}

          <View className="mb-4">
            <View className="bg-surface border border-divider p-1">
              <TextField>
                <TextField.Input
                  value={limit}
                  onChangeText={setLimit}
                  placeholder="Monthly limit"
                  keyboardType="numeric"
                  className="font-mono text-sm h-8"
                />
              </TextField>
            </View>
          </View>

          <View className="flex-row gap-2">
            <Button variant="ghost" onPress={onClose} className="flex-1">
              <Button.Label>Cancel</Button.Label>
            </Button>
            <Button onPress={handleSubmit} isDisabled={loading} className="flex-1">
              <Button.Label>{loading ? "..." : "Save"}</Button.Label>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function FinanceScreen() {
  const data = useFinancialData();
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);

  const monthLabel = useMemo(() => {
    if (!data?.month) return "";
    const [year, month] = data.month.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [data?.month]);

  const driftStatus = useMemo(() => {
    if (!data) return null;
    if (data.totalBudget === 0) return { status: "neutral", label: "NO BUDGET" };
    const ratio = data.totalSpent / data.totalBudget;
    if (ratio > 1) return { status: "danger", label: "OVER BUDGET" };
    if (ratio >= 0.8) return { status: "warning", label: "WATCH" };
    return { status: "success", label: "ON TRACK" };
  }, [data]);

  if (!data) {
    return (
      <Container>
        <View className="flex-1 items-center justify-center">
          <Spinner size="lg" />
        </View>
      </Container>
    );
  }

  return (
    <Container>
      <ScrollView className="flex-1">
        <View className="p-4 gap-4">
          <HardCard label="FINANCE">
            <View className="flex-row justify-between items-center mb-4">
              <MachineText className="text-xl font-bold">{monthLabel}</MachineText>
              <View
                className={`px-2 py-1 ${
                  driftStatus?.status === "danger"
                    ? "bg-danger"
                    : driftStatus?.status === "warning"
                      ? "bg-warning"
                      : driftStatus?.status === "success"
                        ? "bg-success"
                        : "bg-muted"
                }`}
              >
                <MachineText className="text-[10px] font-bold">{driftStatus?.label}</MachineText>
              </View>
            </View>

            <View className="flex-row justify-between mb-1">
              <MachineText variant="label" className="text-[10px]">
                SPENT
              </MachineText>
              <MachineText variant="label" className="text-[10px]">
                BUDGET
              </MachineText>
            </View>
            <View className="flex-row justify-between items-end mb-4">
              <MachineText className="text-3xl font-bold">
                ${data.totalSpent.toFixed(0)}
              </MachineText>
              <MachineText className="text-lg">
                ${data.totalBudget > 0 ? data.totalBudget.toFixed(0) : "—"}
              </MachineText>
            </View>

            {data.totalBudget > 0 && (
              <View className="h-3 bg-muted border border-divider mb-4">
                <View
                  className={`h-full ${
                    driftStatus?.status === "danger"
                      ? "bg-danger"
                      : driftStatus?.status === "warning"
                        ? "bg-warning"
                        : "bg-success"
                  }`}
                  style={{
                    width: `${Math.min(100, (data.totalSpent / data.totalBudget) * 100)}%`,
                  }}
                />
              </View>
            )}

            <View className="flex-row gap-2">
              <Button size="sm" onPress={() => setShowExpenseModal(true)} className="flex-1">
                <Button.Label>+ Expense</Button.Label>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => setShowBudgetModal(true)}
                className="flex-1"
              >
                <Button.Label>Set Budget</Button.Label>
              </Button>
            </View>
          </HardCard>

          <HardCard label="CATEGORIES">
            {data.byCategory.length === 0 ? (
              <MachineText variant="label" className="text-[10px]">
                No spending tracked this month
              </MachineText>
            ) : (
              data.byCategory.map((cat) => (
                <CategoryBar
                  key={cat.category}
                  category={cat.category}
                  spent={cat.spent}
                  budget={cat.budget}
                />
              ))
            )}
          </HardCard>

          <HardCard label="RECENT">
            {data.expenses.length === 0 ? (
              <MachineText variant="label" className="text-[10px]">
                No expenses this month
              </MachineText>
            ) : (
              data.expenses.slice(0, 10).map((expense, i) => (
                <View
                  key={expense.id}
                  className={`flex-row justify-between py-2 ${
                    i < Math.min(data.expenses.length, 10) - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <View>
                    <MachineText className="text-sm capitalize">{expense.category}</MachineText>
                    {expense.note && (
                      <MachineText variant="label" className="text-[10px]">
                        {expense.note}
                      </MachineText>
                    )}
                  </View>
                  <MachineText className="text-sm font-bold">
                    ${expense.amount.toFixed(0)}
                  </MachineText>
                </View>
              ))
            )}
          </HardCard>
        </View>
      </ScrollView>

      <AddExpenseModal visible={showExpenseModal} onClose={() => setShowExpenseModal(false)} />
      <SetBudgetModal visible={showBudgetModal} onClose={() => setShowBudgetModal(false)} />
    </Container>
  );
}
