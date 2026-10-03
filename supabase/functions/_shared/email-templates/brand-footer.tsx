// Ported verbatim from src/lib/email-templates/brand-footer.tsx.
import * as React from "npm:react@19";
import { Hr, Text } from "npm:@react-email/components@0.5";

export const BRAND_FOOTER_TEXT = "ChAi by Dominion Agency · askchai.tech";

export const BrandFooter = () => (
  <>
    <Hr style={rule} />
    <Text style={brandFooter}>{BRAND_FOOTER_TEXT}</Text>
  </>
);

export default BrandFooter;

const rule = { borderColor: "#E3E8EE", margin: "32px 0 16px" };
const brandFooter = { fontSize: "12px", color: "#8A96A3", margin: "0" };
