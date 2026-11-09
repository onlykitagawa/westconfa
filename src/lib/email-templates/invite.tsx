import { AuthEmailLayout } from "./layout";
interface Props { siteName?: string; siteUrl?: string; recipient?: string; oldEmail?: string; email?: string; newEmail?: string; confirmationUrl?: string; token?: string; }
export const InviteEmail = ({ token, confirmationUrl }: Props) => <AuthEmailLayout type="invite" token={token} confirmationUrl={confirmationUrl}  />;
export default InviteEmail;
