"use client";

import { useState } from "react";
import { useConvexAuth } from "convex/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { toast, Toaster } from "react-hot-toast";

export default function AutoBids() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [maxBidAmount, setMaxBidAmount] = useState("100");
  const [maxAuctions, setMaxAuctions] = useState("3");
  const [error, setError] = useState("");

  // Get the user's auto bid configuration
  const autoBid = useQuery(api.autoBids.getMyAutoBid);

  // Get the user's auto bid participations
  const participations = useQuery(api.autoBids.getMyAutoBidParticipations);

  // Get the total number of active participations
  const activeParticipationsCount = useQuery(
    api.autoBids.getActiveParticipationsCount,
  );

  // Get active auctions
  const activeAuctions = useQuery(api.auctions.listActiveAuctions);

  // Mutations
  const createAutoBid = useMutation(api.autoBids.createAutoBid);
  const cancelAutoBid = useMutation(api.autoBids.cancelAutoBid);
  const cancelParticipation = useMutation(
    api.autoBids.cancelAutoBidParticipation,
  );
  const fixInconsistencies = useMutation(
    api.autoBids.fixAutoBidInconsistencies,
  );
  const optimizeMyAutoBidParticipations = useMutation(
    api.autoBids.optimizeMyAutoBidParticipations,
  );

  // State for fixing inconsistencies
  const [isFixing, setIsFixing] = useState(false);

  // Calculate time remaining for an auction
  const calculateTimeRemaining = (endTime: number) => {
    const now = Date.now();
    const timeRemaining = endTime - now;

    if (timeRemaining <= 0) {
      return "Ended";
    }

    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  // Handle creating an auto bid
  const handleCreateAutoBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const maxAmount = parseFloat(maxBidAmount);
    const maxAuctionsCount = parseInt(maxAuctions);

    if (isNaN(maxAmount) || maxAmount <= 0) {
      setError("Please enter a valid maximum bid amount");
      return;
    }

    if (isNaN(maxAuctionsCount) || maxAuctionsCount <= 0) {
      setError("Please enter a valid number of auctions");
      return;
    }

    try {
      await createAutoBid({
        maxAmount,
        maxAuctions: maxAuctionsCount,
      });
      setIsDialogOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Handle canceling an auto bid
  const handleCancelAutoBid = async () => {
    if (!autoBid?._id) return;

    try {
      await cancelAutoBid({
        autoBidId: autoBid._id,
      });
    } catch (err) {
      console.error("Error canceling auto bid:", err);
    }
  };

  // Handle canceling a participation
  const handleCancelParticipation = async (
    participationId: Id<"autoBidParticipations">,
  ) => {
    try {
      await cancelParticipation({
        participationId,
      });
    } catch (err) {
      console.error("Error canceling participation:", err);
    }
  };

  // Handle fixing inconsistencies
  const handleFixInconsistencies = async () => {
    setIsFixing(true);
    try {
      // First fix any inconsistencies
      const result = await fixInconsistencies({});

      // Then optimize participations
      const optimizeResult = await optimizeMyAutoBidParticipations({});

      if (optimizeResult.success) {
        toast.success(
          `Fixed ${result.length} inconsistencies and ${optimizeResult.message}`,
        );
      } else {
        toast.success(`Fixed ${result.length} inconsistencies`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsFixing(false);
    }
  };

  // Open the create dialog
  const openCreateDialog = () => {
    setIsDialogOpen(true);
    setError("");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Auto Bidding</h1>
        <p>Please log in to use the auto bidding feature.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Toaster position="top-right" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Auto Bidding</h1>
        {!autoBid ? (
          <Button onClick={openCreateDialog}>Set Up Auto Bidding</Button>
        ) : (
          <Button variant="destructive" onClick={handleCancelAutoBid}>
            Cancel Auto Bidding
          </Button>
        )}
      </div>

      {/* Auto Bid Configuration */}
      {autoBid && (
        <div className="mb-8 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-xl font-semibold">
              Your Auto Bid Configuration
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFixInconsistencies}
              disabled={isFixing}
            >
              {isFixing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Optimizing...
                </>
              ) : (
                "Optimize Auto Bidding"
              )}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-gray-500">Maximum Bid Per Auction</p>
              <p className="font-medium">${autoBid.maxAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Maximum Auctions</p>
              <p className="font-medium">{autoBid.maxAuctions}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Auctions Won</p>
              <p
                className={`font-medium ${(autoBid.auctionsWon?.length || 0) >= autoBid.maxAuctions ? "text-red-600" : ""}`}
              >
                {autoBid.auctionsWon?.length || 0} / {autoBid.maxAuctions}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Remaining Auctions</p>
              <p
                className={`font-medium ${autoBid.remainingAuctions === 0 ? "text-red-600" : autoBid.remainingAuctions <= 2 ? "text-amber-600" : ""}`}
              >
                {autoBid.remainingAuctions} / {autoBid.maxAuctions}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Participations</p>
              <p className="font-medium">{activeParticipationsCount || 0}</p>
            </div>
          </div>

          {(autoBid.auctionsWon?.length || 0) >= autoBid.maxAuctions && (
            <div className="mt-4 p-3 bg-red-100 text-red-800 rounded-md">
              <p className="font-medium">
                You have reached your maximum number of auction wins.
              </p>
              <p className="text-sm mt-1">
                Your auto bidding is now deactivated. To continue auto bidding,
                please update your settings.
              </p>
              <Button className="mt-2" size="sm" onClick={openCreateDialog}>
                Update Settings
              </Button>
            </div>
          )}

          {autoBid.remainingAuctions === 0 &&
            (autoBid.auctionsWon?.length || 0) < autoBid.maxAuctions && (
              <div className="mt-4 p-3 bg-amber-100 text-amber-800 rounded-md">
                <p className="font-medium">
                  You are participating in the maximum number of auctions.
                </p>
                <p className="text-sm mt-1">
                  You won&apos;t be able to participate in any more auctions
                  with auto bidding until some of your current auctions end.
                </p>
              </div>
            )}

          {autoBid.remainingAuctions > 0 && autoBid.remainingAuctions <= 2 && (
            <div className="mt-4 p-3 bg-amber-100 text-amber-800 rounded-md">
              <p className="font-medium">
                You are close to reaching your maximum number of auctions.
              </p>
              <p className="text-sm mt-1">
                You can only participate in {autoBid.remainingAuctions} more
                auction{autoBid.remainingAuctions !== 1 ? "s" : ""} with auto
                bidding.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Auto Bid Participations */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">
          Your Auto Bid Participations
        </h2>
        {participations === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : participations.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-lg text-center">
            <p>You don&apos;t have any auto bid participations yet.</p>
            <p className="mt-2">
              Auto bidding allows you to set a maximum amount you&apos;re
              willing to pay for auctions, and the system will automatically
              place bids on your behalf.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="p-2 text-left">Auction</th>
                  <th className="p-2 text-left">Current Price</th>
                  <th className="p-2 text-left">Your Current Bid</th>
                  <th className="p-2 text-left">Your Bid Limit</th>
                  <th className="p-2 text-left">Time Remaining</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {participations.map((participation) => (
                  <tr
                    key={participation._id.toString()}
                    className="border-b border-gray-200 dark:border-gray-700"
                  >
                    <td className="p-2">
                      <Link
                        href={`/auctions/${participation.auction._id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {participation.auction.title}
                      </Link>
                    </td>
                    <td className="p-2">
                      ${participation.auction.currentPrice.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {participation.lastBidAmount
                        ? `$${participation.lastBidAmount.toFixed(2)}`
                        : "No bid placed yet"}
                    </td>
                    <td className="p-2">
                      ${participation.maxAmount.toFixed(2)}
                    </td>
                    <td className="p-2">
                      {calculateTimeRemaining(participation.auction.endTime)}
                    </td>
                    <td className="p-2">
                      {participation.isActive ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      {participation.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleCancelParticipation(participation._id)
                          }
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Auctions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Active Auctions</h2>
        {activeAuctions === undefined ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : activeAuctions.length === 0 ? (
          <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-lg text-center">
            <p>There are no active auctions at the moment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">Current Price</th>
                  <th className="p-2 text-left">Time Remaining</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeAuctions.map((auction) => (
                  <tr
                    key={auction._id.toString()}
                    className="border-b border-gray-200 dark:border-gray-700"
                  >
                    <td className="p-2">
                      <Link
                        href={`/auctions/${auction._id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {auction.title}
                      </Link>
                    </td>
                    <td className="p-2">${auction.currentPrice.toFixed(2)}</td>
                    <td className="p-2">
                      {calculateTimeRemaining(auction.endTime)}
                    </td>
                    <td className="p-2">
                      <Link href={`/auctions/${auction._id}`}>
                        <Button variant="outline" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Auto Bid Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Up Auto Bidding</DialogTitle>
            <DialogDescription>
              Enter the maximum amount you&apos;re willing to pay per auction
              and the maximum number of auctions you want to participate in. The
              system will automatically place bids on your behalf, but only as
              much as needed to outbid others.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAutoBid} className="py-4">
            <div className="mb-4">
              <label className="block mb-1">
                Maximum Bid Amount Per Auction ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2">$</span>
                <input
                  type="number"
                  value={maxBidAmount}
                  onChange={(e) => setMaxBidAmount(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="w-full pl-7 p-2 border rounded bg-background"
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block mb-1">Maximum Number of Auctions</label>
              <input
                type="number"
                value={maxAuctions}
                onChange={(e) => setMaxAuctions(e.target.value)}
                min="1"
                className="w-full p-2 border rounded bg-background"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                This is the maximum number of auctions you want to participate
                in. Your auto bidding will stop after winning this many
                auctions.
              </p>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Set Up Auto Bidding</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
