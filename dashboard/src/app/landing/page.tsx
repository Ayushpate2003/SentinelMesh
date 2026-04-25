import { redirect } from "next/navigation"

/** Canonical marketing URL is `/`; keep `/landing` as a friendly alias. */
export default function LandingAliasPage() {
  redirect("/")
}
