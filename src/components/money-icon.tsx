import { forwardRef } from "react";
import { Banknote, DollarSign, type LucideIcon } from "lucide-react";
import { useAccountCurrency } from "@/lib/account-currency";

/** Money icon that follows the account's data currency ($ for USD, a note for ZAR). */
export const MoneyIcon = forwardRef<SVGSVGElement, React.ComponentProps<LucideIcon>>(function MoneyIcon(props, ref) {
  const Icon = useAccountCurrency() === "USD" ? DollarSign : Banknote;
  return <Icon ref={ref} {...props} />;
}) as LucideIcon;
