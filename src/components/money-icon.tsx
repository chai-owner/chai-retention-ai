import { Banknote, DollarSign, type LucideProps } from "lucide-react";
import { useAccountCurrency } from "@/lib/account-currency";

/** Money icon that follows the account's data currency ($ for USD, a note for ZAR). */
export function MoneyIcon(props: LucideProps) {
  const Icon = useAccountCurrency() === "USD" ? DollarSign : Banknote;
  return <Icon {...props} />;
}
