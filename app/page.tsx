import { getArcadeData } from "@/lib/arcade-data";
import { getSessionUser } from "@/lib/auth";
import { Arcade } from "@/components/arcade/Arcade";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const params = await searchParams;
  const [data, sessionUser] = await Promise.all([
    getArcadeData(),
    getSessionUser(),
  ]);

  const entries = data.windows["7d"];
  const myEntry = sessionUser
    ? entries.find(
        (e) => e.handle.toLowerCase() === sessionUser.handle.toLowerCase()
      )
    : null;
  const authStatus =
    params.auth === "ok" && sessionUser
      ? ("ok" as const)
      : params.auth === "failed"
        ? ("failed" as const)
        : null;

  return (
    <Arcade
      data={{
        ...data,
        user: sessionUser
          ? { handle: sessionUser.handle, avatarUrl: sessionUser.avatar_url }
          : null,
      }}
      auth={
        authStatus
          ? {
              status: authStatus,
              rank: myEntry?.rank ?? null,
              total: entries.length,
            }
          : null
      }
    />
  );
}
