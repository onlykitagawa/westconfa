import { AuthEmailLayout } from "./layout";
interface Props { siteName?: string; siteUrl?: string; recipient?: string; oldEmail?: string; email?: string; newEmail?: string; confirmationUrl?: string; token?: string; }
export const SignupEmail = ({ token, confirmationUrl, recipient, oldEmail, newEmail }: Props) => <AuthEmailLayout type="signup" token={token} confirmationUrl={confirmationUrl} detail={recipient} />;
export default SignupEmail;
