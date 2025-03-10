"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export default function AutoBids() {
  const [maxBidAmount, setMaxBidAmount] = useState<number>(0);
  const [targetAuctionCount, setTargetAuctionCount] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [autobidToDelete, setAutobidToDelete] = useState<Id<"autobids"> | null>(
    null,
  );

  // Get user's auto-bids
  const userAutoBids = useQuery(api.autobids.getUserAutoBids);

  // Get auto-bid orderbook
  const autoBidOrderbook = useQuery(api.autobids.getAutoBidOrderbook);

  // Create auto-bid mutation
  const createAutoBid = useMutation(api.autobids.createAutoBid);

  // Deactivate auto-bid mutation
  const deactivateAutoBid = useMutation(api.autobids.deactivateAutoBid);

  // Delete auto-bid mutation
  const deleteAutoBid = useMutation(api.autobids.deleteAutoBid);

  // Delete all auto-bids mutation
  const deleteAllAutoBids = useMutation(api.autobids.deleteAllAutoBids);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (maxBidAmount <= 0) {
      toast.error("Maximum bid amount must be greater than 0");
      return;
    }

    if (targetAuctionCount <= 0) {
      toast.error("Target auction count must be greater than 0");
      return;
    }

    setIsSubmitting(true);

    try {
      await createAutoBid({
        maxBidAmount,
        targetAuctionCount,
      });

      toast.success("Auto-bid created successfully!");
      setMaxBidAmount(0);
      setTargetAuctionCount(1);
    } catch (error) {
      toast.error("Failed to create auto-bid");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (autobidId: Id<"autobids">) => {
    try {
      await deactivateAutoBid({ autobidId });
      toast.success("Auto-bid deactivated successfully!");
    } catch (error) {
      toast.error("Failed to deactivate auto-bid");
      console.error(error);
    }
  };

  const handleDelete = async () => {
    if (!autobidToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteAutoBid({ autobidId: autobidToDelete });
      if (result.success) {
        toast.success(result.message);
        setDeleteDialogOpen(false);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to delete auto-bid");
      console.error(error);
    } finally {
      setIsDeleting(false);
      setAutobidToDelete(null);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAllAutoBids({});
      if (result.success) {
        toast.success(result.message);
        setDeleteAllDialogOpen(false);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error("Failed to delete all auto-bids");
      console.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTimeRemaining = (endTime: number) => {
    const now = Date.now();
    const timeLeftMs = endTime - now;

    if (timeLeftMs <= 0) {
      return "Ended";
    }

    const seconds = Math.floor((timeLeftMs / 1000) % 60);
    const minutes = Math.floor((timeLeftMs / (1000 * 60)) % 60);
    const hours = Math.floor((timeLeftMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(timeLeftMs / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Auto-Bidding System</h1>

      {/* Create Auto-Bid Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Create Auto-Bid</CardTitle>
          <CardDescription>
            Set up an auto-bid to automatically bid on auctions up to your
            maximum amount
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxBidAmount">Maximum Bid Amount</Label>
                <Input
                  id="maxBidAmount"
                  type="number"
                  min="1"
                  step="1"
                  value={maxBidAmount || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setMaxBidAmount(Number(e.target.value))
                  }
                  placeholder="Enter maximum bid amount"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetAuctionCount">Target Auction Count</Label>
                <Input
                  id="targetAuctionCount"
                  type="number"
                  min="1"
                  step="1"
                  value={targetAuctionCount || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setTargetAuctionCount(Number(e.target.value))
                  }
                  placeholder="Enter number of auctions to win"
                  required
                />
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <LoadingSpinner /> : "Create Auto-Bid"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Auto-Bid Orderbook */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Auto-Bid Orderbook</CardTitle>
          <CardDescription>
            Current auto-bids grouped by maximum bid amount
          </CardDescription>
        </CardHeader>
        <CardContent>
          {autoBidOrderbook === undefined ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : autoBidOrderbook.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No active auto-bids found
            </p>
          ) : (
            <Table>
              <TableCaption>
                Auto-bids grouped by maximum bid amount
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Max Bid Amount</TableHead>
                  <TableHead className="w-1/3">Total Target Auctions</TableHead>
                  <TableHead className="w-1/3">Number of Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {autoBidOrderbook.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      ${entry.maxBidAmount}
                    </TableCell>
                    <TableCell>{entry.totalTargetCount}</TableCell>
                    <TableCell>{entry.userCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User's Auto-Bids */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Auto-Bids</CardTitle>
            <CardDescription>
              Your active and inactive auto-bids
            </CardDescription>
          </div>
          {userAutoBids && userAutoBids.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteAllDialogOpen(true)}
            >
              Delete All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {userAutoBids === undefined ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : userAutoBids.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              You don&apos;t have any auto-bids yet
            </p>
          ) : (
            <div className="space-y-8">
              {userAutoBids.map((autoBid) => (
                <div key={autoBid._id} className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold">
                        Max Bid: ${autoBid.maxBidAmount} • Target:{" "}
                        {autoBid.targetAuctionCount} auctions
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Created: {formatDate(autoBid.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={autoBid.isActive ? "default" : "secondary"}
                      >
                        {autoBid.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {autoBid.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(autoBid._id)}
                        >
                          Deactivate
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setAutobidToDelete(autoBid._id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {autoBid.auctions.length > 0 ? (
                    <Table>
                      <TableCaption>
                        Auctions this auto-bid is participating in
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Auction</TableHead>
                          <TableHead>Current Price</TableHead>
                          <TableHead>Your Bid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Time Remaining</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {autoBid.auctions.map((auction) => (
                          <TableRow key={auction._id}>
                            <TableCell className="font-medium">
                              {auction.auction.title}
                            </TableCell>
                            <TableCell>
                              ${auction.auction.currentPrice}
                            </TableCell>
                            <TableCell>${auction.currentBidAmount}</TableCell>
                            <TableCell>
                              {auction.isHighestBidder ? (
                                <Badge className="bg-green-500 text-white">
                                  Highest Bidder
                                </Badge>
                              ) : (
                                <Badge variant="destructive">Outbid</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {auction.auction.status === "active"
                                ? formatTimeRemaining(auction.auction.endTime)
                                : auction.auction.status}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">
                      This auto-bid is not currently participating in any
                      auctions
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Auto-Bid Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Auto-Bid</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this auto-bid? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <LoadingSpinner /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Auto-Bids Dialog */}
      <Dialog open={deleteAllDialogOpen} onOpenChange={setDeleteAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Auto-Bids</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all your auto-bids? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteAllDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={isDeleting}
            >
              {isDeleting ? <LoadingSpinner /> : "Delete All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
