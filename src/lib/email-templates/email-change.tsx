import { AuthEmailLayout } from "./layout";
interface Props { siteName?: string; siteUrl?: string; recipient?: string; oldEmail?: string; email?: string; newEmail?: string; confirmationUrl?: string; token?: string; }
export const EmailChangeEmail = ({ token, confirmationUrl, recipient, oldEmail, newEmail }: Props) => <AuthEmailLayout type="email_change" token={token} confirmationUrl={confirmationUrl} detail={[oldEmail, newEmail].filter(Boolean).join(" → ")} />;
export default EmailChangeEmail;
