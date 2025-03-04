"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { ConvexError } from "convex/values";
import { Toaster, toast } from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function AuctionDetail() {
  const { isAuthenticated } = useConvexAuth();
  const params = useParams();
  const auctionId = params.id as Id<"auctions">;

  const auction = useQuery(api.auctions.getAuctionDetails, {
    auctionId,
  });

  const placeBid = useMutation(api.bids.placeBid);
  const [bidAmount, setBidAmount] = useState("");
  const [error, setError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [startTimeRemaining, setStartTimeRemaining] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [lastExtensionTime, setLastExtensionTime] = useState<number | null>(
    null,
  );

  // Track the last processed event timestamp
  const [lastEventTimestamp, setLastEventTimestamp] = useState<number>(0);

  // Reference to store the user ID to avoid showing toasts for own actions
  const currentUserIdRef = useRef<string | null>(null);

  // Get the current user ID
  const currentUser = useQuery(api.users.getCurrentUser);

  // Subscribe to auction events
  const events = useQuery(api.auctionEvents.subscribeToEvents, {
    auctionId,
    afterTimestamp: lastEventTimestamp,
  });

  // Update the current user ID ref when it changes
  useEffect(() => {
    if (currentUser && currentUser._id) {
      currentUserIdRef.current = currentUser._id;
    }
  }, [currentUser]);

  // Process new events
  useEffect(() => {
    if (!events || events.length === 0) return;

    // Process each event
    events.forEach((event) => {
      // Update the last event timestamp
      if (event.timestamp > lastEventTimestamp) {
        setLastEventTimestamp(event.timestamp);
      }

      // Handle extension events
      if (event.eventType === "extension") {
        // Don't show toast for own actions
        const eventBidderId = event.data.bidderId;
        const currentUserId = currentUserIdRef.current;

        if (
          !eventBidderId ||
          !currentUserId ||
          eventBidderId !== currentUserId
        ) {
          // Show toast notification for the extension
          const newEndTime = new Date(event.data.newEndTime || 0);
          const extensionMinutes = event.data.extensionMinutes || 0;

          toast.success(
            `Auction extended by ${extensionMinutes} minute${extensionMinutes !== 1 ? "s" : ""}! New end time: ${newEndTime.toLocaleTimeString()}`,
            {
              duration: 5000,
              icon: "⏰",
              style: {
                borderRadius: "10px",
                background: "#333",
                color: "#fff",
              },
            },
          );

          // Update the lastExtensionTime to trigger the useEffect for time remaining
          setLastExtensionTime(Date.now());
        }
      }
    });
  }, [events, lastEventTimestamp]);

  // Function to calculate time remaining
  const calculateTimeRemaining = (targetTime: number) => {
    const now = Date.now();
    const diff = targetTime - now;

    if (diff <= 0) {
      return null; // Target time has passed
    }

    // Calculate days, hours, minutes, seconds
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  };

  useEffect(() => {
    if (!auction) return;

    // Initial calculation
    setTimeRemaining(calculateTimeRemaining(auction.endTime));
    setStartTimeRemaining(calculateTimeRemaining(auction.startTime));

    // Set up interval to update every second
    const interval = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(auction.endTime));
      setStartTimeRemaining(calculateTimeRemaining(auction.startTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [auction, lastExtensionTime]);

  // Get recent events for the activity feed
  const recentExtensions = useQuery(api.auctionEvents.getRecentExtensions, {
    auctionId,
    limit: 5,
  });

  // Calculate the next valid bid amount
  const calculateNextValidBid = useCallback(() => {
    if (!auction) return "";

    const minIncrement = auction.bidIncrementMinimum || 0.01;
    const nextBid = (
      Math.floor((auction.currentPrice + minIncrement) * 100) / 100
    ).toFixed(2);
    return nextBid;
  }, [auction]);

  // Set the initial bid amount when the auction data loads
  useEffect(() => {
    if (auction) {
      setBidAmount(calculateNextValidBid());
    }
  }, [
    auction?.currentPrice,
    auction?.bidIncrementMinimum,
    auction,
    calculateNextValidBid,
  ]);

  if (!isAuthenticated) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view auction details</p>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="p-8 text-center">
        <p>Loading auction details...</p>
      </div>
    );
  }

  const now = Date.now();
  const isUpcoming = now < auction.startTime;
  const isActive = now >= auction.startTime && now < auction.endTime;
  const isEnded = now >= auction.endTime;

  const handlePlaceBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= auction.currentPrice) {
      setError(
        `Bid must be higher than the current price: $${auction.currentPrice.toFixed(2)}`,
      );
      return;
    }

    // Check if bid meets minimum increment if set
    if (
      auction.bidIncrementMinimum !== undefined &&
      amount < auction.currentPrice + auction.bidIncrementMinimum
    ) {
      setError(
        `Bid must be at least $${(auction.currentPrice + auction.bidIncrementMinimum).toFixed(2)}`,
      );
      return;
    }

    // Open the confirmation dialog
    setIsDialogOpen(true);
  };

  const confirmBid = async () => {
    try {
      const amount = parseFloat(bidAmount);
      const result = await placeBid({
        auctionId,
        amount,
      });

      // Close the dialog
      setIsDialogOpen(false);

      // Reset bid amount to next valid bid
      setBidAmount(calculateNextValidBid());

      // Show toast notification if the auction was extended
      if (result.wasExtended) {
        const extensionMinutes = auction.extensionDurationMinutes || 0;
        const newEndTime = new Date(result.newEndTime);

        // Update the lastExtensionTime to trigger the useEffect
        setLastExtensionTime(Date.now());

        toast.success(
          `Auction extended by ${extensionMinutes} minute${extensionMinutes !== 1 ? "s" : ""}! New end time: ${newEndTime.toLocaleTimeString()}`,
          {
            duration: 5000,
            icon: "⏰",
            style: {
              borderRadius: "10px",
              background: "#333",
              color: "#fff",
            },
          },
        );
      } else {
        // Show a regular bid confirmation toast
        toast.success("Bid placed successfully!", {
          duration: 3000,
        });
      }
    } catch (error) {
      setIsDialogOpen(false);
      if (error instanceof ConvexError) {
        setError(error.data);
      } else {
        setError("An error occurred while placing your bid");
        console.error(error);
      }
    }
  };

  return (
    <>
      <Toaster position="top-center" />
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold">
            Auction Platform
          </Link>
          <Link href="/auctions" className="hover:underline">
            All Auctions
          </Link>
          <Link href="/create-auction" className="hover:underline">
            Create Auction
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-8">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="md:w-1/2">
            {auction.imageUrl ? (
              <Image
                src={auction.imageUrl}
                alt={auction.title}
                className="w-full h-auto rounded-lg"
                width={500}
                height={300}
              />
            ) : (
              <div className="w-full h-64 bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                No Image
              </div>
            )}
          </div>

          <div className="md:w-1/2">
            <h1 className="text-3xl font-bold mb-2">{auction.title}</h1>
            <p className="mb-4">Created by {auction.creatorName}</p>

            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg mb-6">
              <div className="flex justify-between mb-2">
                <span>Current Price:</span>
                <span className="font-bold">
                  ${auction.currentPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span>Status:</span>
                <span
                  className={
                    isUpcoming
                      ? "text-blue-500"
                      : isActive
                        ? "text-green-500"
                        : "text-red-500"
                  }
                >
                  {isUpcoming
                    ? "Upcoming"
                    : isActive
                      ? "Active"
                      : isEnded
                        ? "Auction Ended"
                        : "Unknown"}
                </span>
              </div>

              {/* Countdown timer for active auctions */}
              {isActive && timeRemaining && (
                <div className="mt-2 border-t pt-2">
                  <div className="text-sm mb-1">Time remaining:</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-background p-2 rounded">
                      <div className="font-bold">{timeRemaining.days}</div>
                      <div className="text-xs">Days</div>
                    </div>
                    <div className="bg-background p-2 rounded">
                      <div className="font-bold">{timeRemaining.hours}</div>
                      <div className="text-xs">Hours</div>
                    </div>
                    <div className="bg-background p-2 rounded">
                      <div className="font-bold">{timeRemaining.minutes}</div>
                      <div className="text-xs">Mins</div>
                    </div>
                    <div className="bg-background p-2 rounded">
                      <div className="font-bold">{timeRemaining.seconds}</div>
                      <div className="text-xs">Secs</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isUpcoming && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                {/* Countdown timer for upcoming auctions */}
                {startTimeRemaining && (
                  <div>
                    <div className="text-sm mb-1 text-center text-blue-800">
                      Time until auction starts:
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-blue-100 p-2 rounded">
                        <div className="font-bold text-blue-800">
                          {startTimeRemaining.days}
                        </div>
                        <div className="text-xs text-blue-600">Days</div>
                      </div>
                      <div className="bg-blue-100 p-2 rounded">
                        <div className="font-bold text-blue-800">
                          {startTimeRemaining.hours}
                        </div>
                        <div className="text-xs text-blue-600">Hours</div>
                      </div>
                      <div className="bg-blue-100 p-2 rounded">
                        <div className="font-bold text-blue-800">
                          {startTimeRemaining.minutes}
                        </div>
                        <div className="text-xs text-blue-600">Mins</div>
                      </div>
                      <div className="bg-blue-100 p-2 rounded">
                        <div className="font-bold text-blue-800">
                          {startTimeRemaining.seconds}
                        </div>
                        <div className="text-xs text-blue-600">Secs</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isActive && (
              <form onSubmit={handlePlaceBid} className="mb-6">
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <span className="absolute left-3 top-2">$</span>
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={`> ${auction.currentPrice.toFixed(2)}`}
                      step="0.01"
                      min={
                        auction.currentPrice +
                        (auction.bidIncrementMinimum || 0.01)
                      }
                      className="w-full pl-7 p-2 border rounded bg-background"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-foreground text-background px-4 py-2 rounded"
                  >
                    Place Bid
                  </button>
                </div>

                {/* Confirmation Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm Your Bid</DialogTitle>
                      <DialogDescription>
                        You are about to place a bid of $
                        {parseFloat(bidAmount).toFixed(2)} on &quot;
                        {auction.title}&quot;. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-gray-500">
                          Current Price:
                        </span>
                        <span className="font-medium">
                          ${auction.currentPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-gray-500">Your Bid:</span>
                        <span className="font-medium">
                          ${parseFloat(bidAmount).toFixed(2)}
                        </span>
                      </div>
                      {auction.bidIncrementMinimum && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">
                            Minimum Increment:
                          </span>
                          <span className="font-medium">
                            ${auction.bidIncrementMinimum.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={confirmBid}>Confirm Bid</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {error && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Bid Error
                      </h3>
                      <div className="mt-1 text-sm text-red-700">{error}</div>
                    </div>
                  </div>
                )}
              </form>
            )}

            {isEnded && (
              <div className="mb-6 p-4 bg-red-50 rounded-lg">
                <p className="text-center text-red-800">
                  This auction has ended. No more bids can be placed.
                </p>
              </div>
            )}

            {/* Extension info */}
            {auction.extensionTimeLeftMinutes !== undefined &&
              auction.extensionDurationMinutes !== undefined &&
              auction.maxExtensionsAllowed !== undefined && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center mb-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <h2 className="text-lg font-bold text-blue-800 dark:text-blue-300">
                      Auction Extensions
                    </h2>
                  </div>
                  <p className="text-blue-700 dark:text-blue-200">
                    This auction will be extended by{" "}
                    {auction.extensionDurationMinutes} minute
                    {auction.extensionDurationMinutes !== 1 ? "s" : ""} if a bid
                    is placed when there are less than{" "}
                    {auction.extensionTimeLeftMinutes} minute
                    {auction.extensionTimeLeftMinutes !== 1 ? "s" : ""}{" "}
                    remaining.
                  </p>
                  <div className="mt-3 flex items-center">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{
                          width: `${Math.min(100, ((auction.extensionCount || 0) / auction.maxExtensionsAllowed) * 100)}%`,
                        }}
                      ></div>
                    </div>
                    <span className="ml-3 text-sm font-medium text-blue-700 dark:text-blue-300">
                      {auction.extensionCount || 0} of{" "}
                      {auction.maxExtensionsAllowed}
                    </span>
                  </div>
                  {auction.extensionCount === auction.maxExtensionsAllowed && (
                    <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="inline-block h-4 w-4 mr-1"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Maximum extensions reached. No more extensions possible.
                    </p>
                  )}
                </div>
              )}

            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">Description</h2>
              <p>{auction.description}</p>
            </div>

            {/* Add coupon bundle information */}
            {auction.couponBundle && (
              <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h2 className="text-xl font-bold mb-2">Prize Bundle</h2>
                <p className="mb-2">
                  <span className="font-semibold">
                    The winning bidder will receive:
                  </span>{" "}
                  {auction.couponBundle.quantity} coupons
                </p>
                <p>{auction.couponBundle.description}</p>
                {isEnded && auction.bids.length > 0 && (
                  <div className="mt-3 p-3 bg-green-100 dark:bg-green-800/30 rounded border border-green-200 dark:border-green-700">
                    <p className="font-bold text-green-800 dark:text-green-300">
                      The winning bidder will receive{" "}
                      {auction.couponBundle.quantity} coupons!
                    </p>
                    <p className="text-sm mt-1">
                      Winner: {auction.bids[0].bidderName}
                    </p>

                    {/* Show coupon codes if the auction has ended */}
                    {auction.couponBundle.coupons &&
                      auction.couponBundle.coupons.length > 0 && (
                        <div className="mt-3">
                          <p className="font-semibold">Coupon Codes:</p>
                          <div className="mt-2 bg-white dark:bg-slate-800 p-2 rounded max-h-40 overflow-y-auto">
                            <ul className="text-sm">
                              {auction.couponBundle.coupons.map((coupon) => (
                                <li
                                  key={coupon._id}
                                  className="mb-1 pb-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                                >
                                  {coupon.isRedeemed ? (
                                    <>
                                      <span className="font-mono">
                                        {coupon.code}
                                      </span>
                                      <span className="ml-2 text-xs bg-red-100 text-red-800 px-1 py-0.5 rounded">
                                        Redeemed
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-sm text-gray-600">
                                      Unredeemed coupon (code generated on
                                      redemption)
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Bid History</h2>
          {auction.bids.length === 0 ? (
            <p>No bids yet. Be the first to place a bid!</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-3 text-left">Bidder</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {auction.bids.map((bid) => (
                    <tr key={bid._id} className="border-t">
                      <td className="p-3">{bid.bidderName}</td>
                      <td className="p-3 text-right">
                        ${bid.amount.toFixed(2)}
                      </td>
                      <td className="p-3 text-right">
                        {new Date(bid.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Extension History */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Extension History</h2>

          {!recentExtensions || recentExtensions.length === 0 ? (
            <p>No extensions have occurred for this auction.</p>
          ) : (
            <div className="space-y-3">
              {recentExtensions.map((event) => (
                <div
                  key={event._id}
                  className="p-3 rounded-lg border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                        ⏰
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{event.data.message}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
