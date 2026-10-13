import type { Metadata } from "next";
import { requireOrgContext } from "@/lib/auth/organization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { Alert, Card, PageHeader } from "@/components/ui/layout";
import { fr } from "@/i18n/fr";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: fr.profile.title };

export default async function ProfilePage() {
  const { user } = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .maybeSingle();
  if (error) logger.error("profile.load_failed", { userId: user.id, code: error.code });

  return (
    <>
      <PageHeader title={fr.profile.title} subtitle={fr.profile.subtitle} />
      <Card className="max-w-lg">
        {error ? (
          <Alert tone="error">{fr.common.unexpectedError}</Alert>
        ) : (
          <ProfileForm email={user.email ?? ""} fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
        )}
      </Card>
    </>
  );
}
