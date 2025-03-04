"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Id } from "../../convex/_generated/dataModel";
import React from "react";
import { ConvexError } from "convex/values";
import { toast, Toaster } from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Define the auction type
interface Auction {
  _id: Id<"auctions">;
  title: string;
  description: string;
  imageUrl?: string;
  startingPrice: number;
  currentPrice: number;
  startTime: number;
  endTime: number;
  creatorId: Id<"users">;
  status: "upcoming" | "active" | "ended" | "canceled";
  creatorName: string;
  bidIncrementMinimum?: number;
  highestBid: {
    _id: Id<"bids">;
    amount: number;
    bidderId: Id<"users">;
    timestamp: number;
  } | null;
  myBid: {
    _id: Id<"bids">;
    amount: number;
    bidderId: Id<"users">;
    timestamp: number;
  } | null;
  computedStatus?: "active" | "upcoming" | "ended";
}

// Define pagination result type
interface PaginatedAuctions {
  auctions: Auction[];
  isDone: boolean;
  continueCursor: string | null;
  totalCount: number;
}

export default function Auctions() {
  const { isAuthenticated } = useConvexAuth();
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [timeLeft, setTimeLeft] = useState<
    Record<
      string,
      { days: number; hours: number; minutes: number; seconds: number } | null
    >
  >({});
  const [quickBidAmounts, setQuickBidAmounts] = useState<
    Record<string, number>
  >({});
  const [bidErrors, setBidErrors] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const itemsPerPage = 10;
  const [confirmBidAuctionId, setConfirmBidAuctionId] =
    useState<Id<"auctions"> | null>(null);
  const [confirmBidAmount, setConfirmBidAmount] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch paginated auctions
  const paginatedResult = useQuery(api.auctions.listAuctions, {
    onlyMine: showMineOnly,
    paginationOpts: {
      numItems: itemsPerPage,
      cursor: currentPage > 0 ? (currentPage * itemsPerPage).toString() : null,
    },
  }) as PaginatedAuctions | undefined;

  // Extract auctions and pagination info
  const auctions = useMemo(
    () => paginatedResult?.auctions || [],
    [paginatedResult?.auctions],
  );
  const totalCount = paginatedResult?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const placeBid = useMutation(api.bids.placeBid);

  // Navigate to a specific page
  const goToPage = (page: number) => {
    if (page >= 0 && page < totalPages) {
      setIsLoading(true);
      setCurrentPage(page);
    }
  };

  // Reset pagination when filter changes
  useEffect(() => {
    setCurrentPage(0);
  }, [showMineOnly]);

  // Update loading state when data arrives
  useEffect(() => {
    if (paginatedResult) {
      setIsLoading(false);
    }
  }, [paginatedResult]);

  // Update countdown timer every second
  useEffect(() => {
    if (!auctions.length) return;

    // Initialize quick bid amounts
    const initialBidAmounts: Record<string, number> = {};
    auctions.forEach((auction) => {
      const minIncrement = auction.bidIncrementMinimum || 1;
      initialBidAmounts[auction._id] = auction.currentPrice + minIncrement;
    });
    setQuickBidAmounts(initialBidAmounts);

    // Set up countdown timer
    const timer = setInterval(() => {
      const now = Date.now();
      const newTimeLeft: Record<
        string,
        { days: number; hours: number; minutes: number; seconds: number } | null
      > = {};

      auctions.forEach((auction) => {
        if (now < auction.startTime) {
          // Auction hasn't started yet
          const timeToStart = auction.startTime - now;
          newTimeLeft[auction._id] = calculateTimeRemaining(timeToStart);
        } else if (now < auction.endTime) {
          // Auction is active
          const timeRemaining = auction.endTime - now;
          newTimeLeft[auction._id] = calculateTimeRemaining(timeRemaining);
        } else {
          // Auction has ended
          newTimeLeft[auction._id] = null;
        }
      });

      setTimeLeft(newTimeLeft);
    }, 1000);

    return () => clearInterval(timer);
  }, [auctions]);

  const calculateTimeRemaining = (ms: number) => {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds };
  };

  // Calculate the next valid bid amount for an auction
  const calculateNextValidBid = useCallback((auction: Auction) => {
    const minIncrement = auction.bidIncrementMinimum || 1;
    return auction.currentPrice + minIncrement;
  }, []);

  // Update quick bid amounts when auctions load or change
  useEffect(() => {
    if (auctions && auctions.length > 0) {
      const newQuickBidAmounts: Record<Id<"auctions">, number> = {};
      auctions.forEach((auction) => {
        newQuickBidAmounts[auction._id] = calculateNextValidBid(auction);
      });
      setQuickBidAmounts((prev) => ({
        ...prev,
        ...newQuickBidAmounts,
      }));
    }
  }, [auctions, calculateNextValidBid]);

  const handleQuickBid = async (auctionId: Id<"auctions">, amount: number) => {
    try {
      // Clear any previous errors
      setBidErrors((prev) => ({ ...prev, [auctionId]: "" }));

      // Validate the bid amount
      const auction = auctions?.find((a) => a._id === auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      if (amount <= auction.currentPrice) {
        setBidErrors((prev) => ({
          ...prev,
          [auctionId]: `Bid must be higher than current price: $${auction.currentPrice.toFixed(2)}`,
        }));
        return;
      }

      if (
        auction.bidIncrementMinimum !== undefined &&
        amount < auction.currentPrice + auction.bidIncrementMinimum
      ) {
        const minBid =
          auction.currentPrice + (auction.bidIncrementMinimum || 0);
        setBidErrors((prev) => ({
          ...prev,
          [auctionId]: `Bid must be at least $${minBid.toFixed(2)}`,
        }));
        return;
      }

      // Set the confirmation dialog data
      setConfirmBidAuctionId(auctionId);
      setConfirmBidAmount(amount);
      setIsDialogOpen(true);
    } catch (error) {
      const errorMessage =
        error instanceof ConvexError ? error.data : "Error placing bid";
      setBidErrors((prev) => ({ ...prev, [auctionId]: errorMessage }));
      toast.error(errorMessage);
    }
  };

  const confirmBid = async () => {
    if (!confirmBidAuctionId || confirmBidAmount === null) {
      setIsDialogOpen(false);
      return;
    }

    try {
      await placeBid({
        auctionId: confirmBidAuctionId,
        amount: confirmBidAmount,
      });

      toast.success("Bid placed successfully!");

      // Update the quick bid amount for next time
      const auction = auctions?.find((a) => a._id === confirmBidAuctionId);
      if (auction) {
        const minIncrement = auction.bidIncrementMinimum || 1;
        setQuickBidAmounts((prev) => ({
          ...prev,
          [confirmBidAuctionId]: confirmBidAmount + minIncrement,
        }));
      }

      // Close the dialog
      setIsDialogOpen(false);
      setConfirmBidAuctionId(null);
      setConfirmBidAmount(null);
    } catch (error) {
      const errorMessage =
        error instanceof ConvexError ? error.data : "Error placing bid";
      if (confirmBidAuctionId) {
        setBidErrors((prev) => ({
          ...prev,
          [confirmBidAuctionId]: errorMessage,
        }));
      }
      toast.error(errorMessage);
      setIsDialogOpen(false);
    }
  };

  const getAuctionStatus = (auction: Auction) => {
    // Use the pre-computed status if available
    if (auction.computedStatus) {
      return (
        auction.computedStatus.charAt(0).toUpperCase() +
        auction.computedStatus.slice(1)
      );
    }

    // Otherwise calculate it
    const now = Date.now();
    if (now < auction.startTime) return "Upcoming";
    if (now < auction.endTime) return "Active";
    return "Ended";
  };

  const formatTimeRemaining = (
    time: {
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    } | null,
  ) => {
    if (!time) return "Ended";

    const parts = [];
    if (time.days > 0) parts.push(`${time.days}d`);
    if (time.hours > 0) parts.push(`${time.hours}h`);
    if (time.minutes > 0) parts.push(`${time.minutes}m`);
    parts.push(`${time.seconds}s`);

    return parts.join(" ");
  };

  // Generate pagination controls
  const renderPaginationControls = () => {
    if (totalPages <= 1) return null;

    // Calculate which page numbers to show
    const pageNumbers = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if there are few
      for (let i = 0; i < totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Always include first page
      pageNumbers.push(0);

      // Calculate middle pages
      let startPage = Math.max(1, currentPage - 1);
      let endPage = Math.min(totalPages - 2, currentPage + 1);

      // Adjust if we're near the beginning or end
      if (currentPage <= 1) {
        endPage = Math.min(totalPages - 2, 3);
      } else if (currentPage >= totalPages - 2) {
        startPage = Math.max(1, totalPages - 4);
      }

      // Add ellipsis if needed
      if (startPage > 1) {
        pageNumbers.push(-1); // -1 represents ellipsis
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }

      // Add ellipsis if needed
      if (endPage < totalPages - 2) {
        pageNumbers.push(-2); // -2 represents ellipsis
      }

      // Always include last page
      pageNumbers.push(totalPages - 1);
    }

    return (
      <div className="flex items-center justify-center mt-6 gap-2">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0 || isLoading}
          className="px-3 py-1 rounded border disabled:opacity-50"
        >
          &lt; Prev
        </button>

        {pageNumbers.map((pageNum, index) => {
          if (pageNum < 0) {
            // Render ellipsis
            return <span key={`ellipsis-${index}`}>...</span>;
          }

          return (
            <button
              key={pageNum}
              onClick={() => goToPage(pageNum)}
              disabled={isLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentPage === pageNum
                  ? "bg-foreground text-background"
                  : "border hover:bg-slate-100"
              }`}
            >
              {pageNum + 1}
            </button>
          );
        })}

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1 || isLoading}
          className="px-3 py-1 rounded border disabled:opacity-50"
        >
          Next &gt;
        </button>

        <span className="ml-4 text-sm text-gray-500">
          Page {currentPage + 1} of {totalPages} ({totalCount} auctions)
        </span>
      </div>
    );
  };

  if (!isAuthenticated) {
    return <div>Please log in to view auctions</div>;
  }

  return (
    <>
      <Toaster position="top-right" />
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold">
            Auction Platform
          </Link>
          <Link href="/create-auction" className="hover:underline">
            Create Auction
          </Link>
          <Link href="/coupons" className="hover:underline">
            My Coupons
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Auctions</h1>
          <div className="flex items-center gap-2">
            <label>
              <input
                type="checkbox"
                checked={showMineOnly}
                onChange={() => setShowMineOnly(!showMineOnly)}
                className="mr-2"
              />
              Show only my auctions
            </label>
            <Link
              href="/create-auction"
              className="bg-foreground text-background px-4 py-2 rounded"
            >
              Create Auction
            </Link>
          </div>
        </div>

        {paginatedResult === undefined ? (
          <div>Loading auctions...</div>
        ) : auctions.length === 0 ? (
          <div>No auctions found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="p-3 text-left border-b">Auction</th>
                    <th className="p-3 text-right border-b">Highest Bid</th>
                    <th className="p-3 text-right border-b">My Bid</th>
                    <th className="p-3 text-center border-b">Countdown</th>
                    <th className="p-3 text-center border-b">Status</th>
                    <th className="p-3 text-right border-b">Quick Bid</th>
                  </tr>
                </thead>
                <tbody>
                  {auctions.map((auction) => {
                    const status = getAuctionStatus(auction);
                    const isActive = status === "Active";

                    return (
                      <tr
                        key={auction._id}
                        className="border-b hover:bg-slate-50 dark:hover:bg-slate-900/30"
                      >
                        <td className="p-3">
                          <Link
                            href={`/auctions/${auction._id}`}
                            className="hover:underline font-medium"
                          >
                            {auction.title}
                          </Link>
                          <div className="text-sm text-gray-500">
                            by {auction.creatorName}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          ${auction.currentPrice.toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          {auction.myBid
                            ? `$${auction.myBid.amount.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="p-3 text-center">
                          <div className="font-mono">
                            {formatTimeRemaining(timeLeft[auction._id])}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              status === "Active"
                                ? "bg-green-100 text-green-800"
                                : status === "Upcoming"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {isActive && (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                value={String(
                                  quickBidAmounts[auction._id] ||
                                    auction.currentPrice +
                                      (auction.bidIncrementMinimum || 1),
                                )}
                                onChange={(e) =>
                                  setQuickBidAmounts((prev) => ({
                                    ...prev,
                                    [auction._id]: parseFloat(e.target.value),
                                  }))
                                }
                                className="w-24 p-1 border rounded text-right"
                                min={
                                  auction.currentPrice +
                                  (auction.bidIncrementMinimum || 0.01)
                                }
                                step="0.01"
                              />
                              <button
                                onClick={() =>
                                  handleQuickBid(
                                    auction._id,
                                    quickBidAmounts[auction._id],
                                  )
                                }
                                className="bg-foreground text-background px-3 py-1 rounded text-sm"
                              >
                                Bid
                              </button>
                            </div>
                          )}
                          {bidErrors[auction._id] && (
                            <div className="text-xs text-red-500 mt-1">
                              {bidErrors[auction._id]}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {renderPaginationControls()}
          </>
        )}
      </main>

      {/* Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Your Bid</DialogTitle>
            <DialogDescription>
              {confirmBidAuctionId && confirmBidAmount !== null && auctions && (
                <>
                  You are about to place a bid of ${confirmBidAmount.toFixed(2)}{" "}
                  on &quot;
                  {auctions.find((a) => a._id === confirmBidAuctionId)?.title}
                  &quot;. This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {confirmBidAuctionId && confirmBidAmount !== null && auctions && (
            <div className="py-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Current Price:</span>
                <span className="font-medium">
                  $
                  {auctions
                    .find((a) => a._id === confirmBidAuctionId)
                    ?.currentPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">Your Bid:</span>
                <span className="font-medium">
                  ${confirmBidAmount.toFixed(2)}
                </span>
              </div>
              {auctions.find((a) => a._id === confirmBidAuctionId)
                ?.bidIncrementMinimum && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">
                    Minimum Increment:
                  </span>
                  <span className="font-medium">
                    $
                    {auctions
                      .find((a) => a._id === confirmBidAuctionId)
                      ?.bidIncrementMinimum?.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBid}>Confirm Bid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
