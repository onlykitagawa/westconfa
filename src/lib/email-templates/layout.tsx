import type { CSSProperties } from "react";
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { emailCopy as copy } from "@/i18n/email.en";

// Email-safe equivalents of the app's indigo/coral theme; mail clients cannot load app CSS.
const theme = { background: "#ffffff", foreground: "#241b43", muted: "#615a73", primary: "#4f2fd6", accent: "#ee806b", border: "#e7e1f2", code: "#f4f1fc" };
export function AuthEmailLayout({ type, token, confirmationUrl, detail }: { type: keyof Omit<typeof copy, "brand" | "footer" | "ignore" | "codeHint">; token?: string; confirmationUrl?: string; detail?: string }) {
  const content = copy[type];
  return <Html lang="en" dir="ltr"><Head /><Preview>{content.subject}</Preview>
    <Body style={{ backgroundColor: theme.background, color: theme.foreground, fontFamily: "'Plus Jakarta Sans', Arial, sans-serif", margin: 0 }}>
      <Container style={{ maxWidth: "480px", padding: "36px 24px", borderTop: `4px solid ${theme.accent}` }}>
        <Text style={{ color: theme.primary, fontSize: "22px", fontWeight: 800 }}>{copy.brand}</Text>
        <Heading style={{ fontSize: "26px", lineHeight: "34px" }}>{content.title}</Heading>
        <Text style={textStyle}>{content.body}</Text>
        {detail && <Text style={textStyle}>{detail}</Text>}
        {token && <><Text style={{ padding: "20px", backgroundColor: theme.code, color: theme.primary, borderRadius: "8px", fontFamily: "monospace", fontSize: "32px", fontWeight: 700, textAlign: "center", letterSpacing: 0 }}>{token}</Text><Text style={textStyle}>{copy.codeHint}</Text></>}
        {confirmationUrl && content.button && <Button href={confirmationUrl} style={{ backgroundColor: theme.primary, color: theme.background, padding: "16px 24px", borderRadius: "8px", fontSize: "16px", fontWeight: 700 }}>{content.button}</Button>}
        <Text style={{ ...textStyle, marginTop: "32px", fontSize: "13px" }}>{copy.ignore}</Text>
        <Text style={{ ...textStyle, borderTop: `1px solid ${theme.border}`, paddingTop: "20px", fontSize: "12px" }}>{copy.footer}</Text>
      </Container>
    </Body>
  </Html>;
}
const textStyle: CSSProperties = { color: theme.muted, fontSize: "15px", lineHeight: "24px", overflowWrap: "anywhere" };
