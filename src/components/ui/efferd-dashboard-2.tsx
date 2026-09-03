import React from "react";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";

export function EfferdDashboard2({ hosps, feed, healthData }: any) {
  return (
    <AppShell healthData={healthData}>
      <Dashboard hosps={hosps} feed={feed} healthData={healthData} />
    </AppShell>
  );
}

export default EfferdDashboard2;
