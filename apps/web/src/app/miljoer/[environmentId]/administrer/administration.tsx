import type { Environment } from "@lanbort/contracts";
import { getEnvironment } from "@lanbort/domain";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import {
  type AdministrationPage,
  administrationPageHref,
  administrationPages,
  describeRoles,
} from "@/presentation/environment-admin";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";
import { environmentHome } from "../back";

export type AdministrationParams = Promise<{ environmentId: string }>;

/**
 * The environment as its administrators see it. Only the environment's
 * roles reach its administration; to anyone else it does not exist, like
 * any page they may not see (PS-NFR-002). Every action is authorized
 * again by the API.
 */
export async function loadAdministration(params: AdministrationParams) {
  const account = await requirePageAccount();
  const { environmentId } = await params;
  const environment = await pageQueryOrNotFound(getEnvironment, {
    environmentId,
  });

  if (environment.roles.length === 0) {
    notFound();
  }

  return { account, environment };
}

/**
 * One of the administration's tasks. An administrator who is not an
 * active member cannot administer (PS-ENV-003); «Administrer miljøet»
 * tells them why.
 */
export async function loadAdministrationTask(params: AdministrationParams) {
  const loaded = await loadAdministration(params);

  if (loaded.environment.membership?.state !== "active") {
    redirect(administrationPageHref(loaded.environment.id));
  }

  return loaded;
}

export const administrationMetadata = (page: AdministrationPage): Metadata => ({
  title: `${administrationPages[page].title} – Lånbort`,
});

/** The role the administrator acts in, on every page (UX-PRIV-005). */
export const RoleTag = ({ environment }: { environment: Environment }) => (
  <Tag icon="shield">Du er {describeRoles(environment.roles)}</Tag>
);

/** The top of a task's page, in the stack under «Administrer miljøet». */
export function AdministrationHeader({
  environment,
  page,
  children,
}: {
  environment: Environment;
  page: AdministrationPage;
  children?: ReactNode;
}) {
  return (
    <PageHeader
      title={administrationPages[page].title}
      back={{
        href: administrationPageHref(environment.id),
        label: "Administrer",
      }}
      home={environmentHome(environment)}
      context={<RoleTag environment={environment} />}
    >
      {children}
    </PageHeader>
  );
}
