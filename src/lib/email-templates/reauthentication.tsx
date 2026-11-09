import { AuthEmailLayout } from "./layout";
interface Props { siteName?: string; siteUrl?: string; recipient?: string; oldEmail?: string; email?: string; newEmail?: string; confirmationUrl?: string; token?: string; }
export const ReauthenticationEmail = ({ token, confirmationUrl }: Props) => <AuthEmailLayout type="reauthentication" token={token} confirmationUrl={confirmationUrl}  />;
export default ReauthenticationEmail;
