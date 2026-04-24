import { Dashboard } from "@/components/dashboard";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  await requireUser();
  return <Dashboard />;
}
