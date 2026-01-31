import { Redirect } from "expo-router";

export default function Middleware() {
  return <Redirect href="/boot" />;
}
