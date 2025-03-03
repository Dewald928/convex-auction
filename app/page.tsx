"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Link from "next/link";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <div>Auction Platform</div>
        <div className="flex gap-4">
          <Link href="/auctions" className="hover:underline">
            Browse Auctions
          </Link>
          <Link href="/create-auction" className="hover:underline">
            Create Auction
          </Link>
          <Link href="/coupons" className="hover:underline">
            My Coupons
          </Link>
        </div>
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">
          Welcome to the Auction Platform
        </h1>
        <div className="flex flex-col gap-8 max-w-lg mx-auto">
          <div className="flex flex-col items-center">
            <p className="mb-6 text-center">
              Buy and sell items through our real-time auction platform. Create
              your own auctions or bid on existing ones!
            </p>
            <div className="flex gap-4">
              <Link
                href="/auctions"
                className="bg-foreground text-background px-6 py-3 rounded-md font-bold"
              >
                Browse Auctions
              </Link>
              <Link
                href="/create-auction"
                className="bg-slate-200 dark:bg-slate-800 px-6 py-3 rounded-md font-bold"
              >
                Create Auction
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <>
      {isAuthenticated && (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-foreground rounded-md px-2 py-1"
          onClick={() =>
            void signOut().then(() => {
              router.push("/signin");
            })
          }
        >
          Sign out
        </button>
      )}
    </>
  );
}
