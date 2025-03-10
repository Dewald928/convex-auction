"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="bg-gray-100 py-4">
      <div className="container mx-auto flex items-center">
        <Link href="/" className="text-xl font-bold mr-8">
          Auctions
        </Link>
        <div className="flex space-x-4">
          <Link
            href="/"
            className={`px-3 py-2 rounded-md ${
              isActive("/") ? "bg-blue-500 text-white" : "hover:bg-gray-200"
            }`}
          >
            Home
          </Link>
          <Link
            href="/auctions"
            className={`px-3 py-2 rounded-md ${
              isActive("/auctions")
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-200"
            }`}
          >
            Auctions
          </Link>
          <Link
            href="/autobids"
            className={`px-3 py-2 rounded-md ${
              isActive("/autobids")
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-200"
            }`}
          >
            Auto-Bids
          </Link>
          <Link
            href="/coupons"
            className={`px-3 py-2 rounded-md ${
              isActive("/coupons")
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-200"
            }`}
          >
            My Coupons
          </Link>
          <Link
            href="/create-auction"
            className={`px-3 py-2 rounded-md ${
              isActive("/create-auction")
                ? "bg-blue-500 text-white"
                : "hover:bg-gray-200"
            }`}
          >
            Create Auction
          </Link>
        </div>
      </div>
    </nav>
  );
}
