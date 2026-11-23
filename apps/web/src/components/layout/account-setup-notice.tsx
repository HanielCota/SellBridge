import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  isOnNoticePage,
  type SetupNotice,
  type SetupNoticePage,
} from "@/features/account-setup/account-setup-notice";
import { useAccountSetupNotice } from "@/features/account-setup/use-account-setup-notice";
import { HEADER_NOTICE_CLASS_NAME, HeaderNoticeContent, headerNoticeLabel } from "./header-notice";

interface LinkLook {
  "aria-label": string;
  title: string;
  className: string;
}

/** One typed router link per page, so a renamed route or search field fails the build. */
function PageLink({
  page,
  look,
  children,
}: {
  page: SetupNoticePage;
  look: LinkLook;
  children: ReactNode;
}) {
  if (page === "receiving") {
    return (
      <Link to="/fornecedor/painel/recebimentos" {...look}>
        {children}
      </Link>
    );
  }
  if (page === "new-product") {
    return (
      <Link to="/fornecedor/painel/produtos" search={{ product: "novo" }} {...look}>
        {children}
      </Link>
    );
  }
  if (page === "products") {
    return (
      <Link to="/fornecedor/painel/produtos" {...look}>
        {children}
      </Link>
    );
  }
  if (page === "brand") {
    return (
      <Link to="/fornecedor/painel/marca" {...look}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/onboarding" search={{ step: "details" }} {...look}>
      {children}
    </Link>
  );
}

function NoticeLink({ notice }: { notice: SetupNotice }) {
  const look: LinkLook = {
    "aria-label": headerNoticeLabel(notice.message, notice.action),
    title: notice.reason,
    className: HEADER_NOTICE_CLASS_NAME,
  };
  const content = <HeaderNoticeContent message={notice.message} action={notice.action} />;
  const { target } = notice;
  // The Bling authorization is a server route that leaves the app: a plain link, not the router.
  if (target.kind === "authorization") {
    return (
      <a href={target.href} {...look}>
        {content}
      </a>
    );
  }
  return (
    <PageLink page={target.page} look={look}>
      {content}
    </PageLink>
  );
}

/**
 * The header's ask to finish the account: one item at a time, the most important first, with the
 * button that fixes it. Accounts the team created, or that skipped the setup, find it here.
 */
export function AccountSetupNotice({ enabled, pathname }: { enabled: boolean; pathname: string }) {
  const query = useAccountSetupNotice(enabled);
  const notice = query.data ?? null;
  const noticeKey = notice?.key ?? null;
  const { refetch } = query;
  const router = useRouter();
  // The item is fixed on another page: reading again on the next page lets it leave right away.
  useEffect(() => {
    if (noticeKey === null) {
      return undefined;
    }
    return router.subscribe("onResolved", () => {
      void refetch();
    });
  }, [router, noticeKey, refetch]);
  if (notice === null || isOnNoticePage(notice, pathname)) {
    return null;
  }
  return <NoticeLink notice={notice} />;
}
