"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function CreateAuction() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const createAuction = useMutation(api.auctions.createAuction);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [startingPrice, setStartingPrice] = useState(0);
  const [bidIncrementMinimum, setBidIncrementMinimum] = useState<
    number | undefined
  >(undefined);
  const [durationInMinutes, setDurationInMinutes] = useState<
    number | undefined
  >(60); // Default 1 hour
  const [separationTimeInMinutes, setSeparationTimeInMinutes] = useState<
    number | undefined
  >(15); // Default 15 minutes
  const [numberOfAuctions, setNumberOfAuctions] = useState(1);
  const [useEndTime, setUseEndTime] = useState(true);
  const [couponDescription, setCouponDescription] = useState<string>("");

  // Extension parameters
  const [enableExtensions, setEnableExtensions] = useState(false);
  const [extensionTimeLeftMinutes, setExtensionTimeLeftMinutes] = useState<
    number | undefined
  >(2); // Default 2 minutes
  const [extensionDurationMinutes, setExtensionDurationMinutes] = useState<
    number | undefined
  >(1); // Default 1 minute
  const [maxExtensionsAllowed, setMaxExtensionsAllowed] = useState<
    number | undefined
  >(5); // Default 5 extensions

  // Replace start delay and duration with direct datetime values
  const defaultStartDate = new Date();
  defaultStartDate.setMinutes(defaultStartDate.getMinutes() + 5); // Set default start time to 5 minutes from now

  const defaultEndDate = new Date(defaultStartDate);
  defaultEndDate.setDate(defaultEndDate.getDate() + 7); // Set default end time to 7 days after start

  const [startTime, setStartTime] = useState(defaultStartDate);
  const [endTime, setEndTime] = useState(defaultEndDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate end time if using duration
    const calculatedEndTime = useEndTime
      ? endTime.getTime()
      : startTime.getTime() + (durationInMinutes || 60) * 60 * 1000;

    try {
      await createAuction({
        title,
        description,
        imageUrl: imageUrl || undefined,
        startingPrice,
        startTime: startTime.getTime(),
        endTime: calculatedEndTime,
        bidIncrementMinimum,
        durationInMinutes: useEndTime ? undefined : durationInMinutes,
        separationTimeInMinutes,
        numberOfAuctions: numberOfAuctions > 1 ? numberOfAuctions : undefined,
        couponDescription: couponDescription || undefined,
        // Include extension parameters only if extensions are enabled
        extensionTimeLeftMinutes: enableExtensions
          ? extensionTimeLeftMinutes
          : undefined,
        extensionDurationMinutes: enableExtensions
          ? extensionDurationMinutes
          : undefined,
        maxExtensionsAllowed: enableExtensions
          ? maxExtensionsAllowed
          : undefined,
      });

      router.push("/auctions");
    } catch (error) {
      console.error("Error creating auction:", error);
    }
  };

  // Helper function to format date for datetime-local input
  const formatDatetimeLocal = (date: Date): string => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  if (!isAuthenticated) {
    return <div>Please log in to create an auction</div>;
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold">
            Auction Platform
          </Link>
          <Link href="/auctions" className="hover:underline">
            View Auctions
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Create New Auction</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded bg-background"
              required
            />
          </div>

          <div>
            <label className="block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border rounded bg-background"
              rows={4}
              required
            />
          </div>

          <div>
            <label className="block mb-1">Image URL (optional)</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full p-2 border rounded bg-background"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Starting Price ($)</label>
              <input
                type="number"
                value={startingPrice}
                onChange={(e) => setStartingPrice(Number(e.target.value))}
                min="0"
                step="0.01"
                className="w-full p-2 border rounded bg-background"
                required
              />
            </div>
          </div>

          <div>
            <label className="block mb-1">
              Minimum Bid Increment ($) (optional)
            </label>
            <input
              type="number"
              value={
                bidIncrementMinimum !== undefined ? bidIncrementMinimum : ""
              }
              onChange={(e) =>
                setBidIncrementMinimum(
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              min="0"
              step="0.01"
              className="w-full p-2 border rounded bg-background"
            />
          </div>

          <div>
            <label className="block mb-1">Start Date and Time</label>
            <input
              type="datetime-local"
              value={formatDatetimeLocal(startTime)}
              onChange={(e) => {
                const newDate = e.target.value
                  ? new Date(e.target.value)
                  : new Date();
                setStartTime(newDate);

                // If end time is before new start time, update end time
                if (endTime < newDate) {
                  const newEndTime = new Date(newDate);
                  newEndTime.setDate(newEndTime.getDate() + 1); // Set at least 1 day later
                  setEndTime(newEndTime);
                }
              }}
              className="w-full p-2 border rounded bg-background"
              required
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              id="useEndTime"
              checked={useEndTime}
              onChange={(e) => setUseEndTime(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="useEndTime">Specify exact end time</label>
          </div>

          {useEndTime ? (
            <div>
              <label className="block mb-1">End Date and Time</label>
              <input
                type="datetime-local"
                value={formatDatetimeLocal(endTime)}
                onChange={(e) => {
                  const newDate = e.target.value
                    ? new Date(e.target.value)
                    : new Date();
                  setEndTime(newDate);
                }}
                min={formatDatetimeLocal(startTime)}
                className="w-full p-2 border rounded bg-background"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block mb-1">Duration (minutes)</label>
              <input
                type="number"
                value={durationInMinutes || ""}
                onChange={(e) =>
                  setDurationInMinutes(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                min="1"
                className="w-full p-2 border rounded bg-background"
                required={!useEndTime}
              />
            </div>
          )}

          <div>
            <label className="block mb-1">Number of Auctions to Create</label>
            <input
              type="number"
              value={numberOfAuctions}
              onChange={(e) => setNumberOfAuctions(Number(e.target.value))}
              min="1"
              step="1"
              className="w-full p-2 border rounded bg-background"
              required
            />
          </div>

          <div>
            <label className="block mb-1">
              Coupon Bundle Description (optional)
            </label>
            <textarea
              value={couponDescription}
              onChange={(e) => setCouponDescription(e.target.value)}
              className="w-full p-2 border rounded bg-background h-24"
              placeholder="Describe the coupon bundle that will be awarded to the winning bidder (e.g., 10 coupons for 20% off any product)"
            />
            <p className="text-sm text-gray-500 mt-1">
              Each auction winner will receive a bundle of 10 coupons.
            </p>
          </div>

          {numberOfAuctions > 1 && (
            <div>
              <label className="block mb-1">
                Time Between Auction Start Times (minutes)
              </label>
              <div className="text-sm text-gray-500 mb-2">
                The time from the start of one auction to the start of the next.
                If this is shorter than the auction duration, auctions will
                start immediately after the previous one ends.
              </div>
              <input
                type="number"
                value={separationTimeInMinutes || ""}
                onChange={(e) =>
                  setSeparationTimeInMinutes(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                min="0"
                className="w-full p-2 border rounded bg-background"
              />
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id="enableExtensions"
              checked={enableExtensions}
              onChange={(e) => setEnableExtensions(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="enableExtensions">
              Enable auction extensions (extend auction time when bids are
              placed near the end)
            </label>
          </div>

          {enableExtensions && (
            <div className="mt-2 p-4 border rounded-md bg-slate-50 dark:bg-slate-900">
              <h3 className="font-bold mb-3">Auction Extension Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-1">
                    Extend when time left is under (minutes)
                  </label>
                  <input
                    type="number"
                    value={extensionTimeLeftMinutes || ""}
                    onChange={(e) =>
                      setExtensionTimeLeftMinutes(
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    min="0.5"
                    step="0.5"
                    className="w-full p-2 border rounded bg-background"
                    required={enableExtensions}
                  />
                </div>
                <div>
                  <label className="block mb-1">
                    Extend auction by (minutes)
                  </label>
                  <input
                    type="number"
                    value={extensionDurationMinutes || ""}
                    onChange={(e) =>
                      setExtensionDurationMinutes(
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    min="0.5"
                    step="0.5"
                    className="w-full p-2 border rounded bg-background"
                    required={enableExtensions}
                  />
                </div>
                <div>
                  <label className="block mb-1">
                    Maximum number of extensions
                  </label>
                  <input
                    type="number"
                    value={maxExtensionsAllowed || ""}
                    onChange={(e) =>
                      setMaxExtensionsAllowed(
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    min="1"
                    step="1"
                    className="w-full p-2 border rounded bg-background"
                    required={enableExtensions}
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                If a bid is placed when there are less than{" "}
                {extensionTimeLeftMinutes} minutes left, the auction will be
                extended by {extensionDurationMinutes} minute
                {extensionDurationMinutes !== 1 ? "s" : ""}. This can happen at
                most {maxExtensionsAllowed} time
                {maxExtensionsAllowed !== 1 ? "s" : ""}.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="bg-foreground text-background font-bold py-2 px-4 rounded mt-4"
          >
            Create Auction{numberOfAuctions > 1 ? "s" : ""}
          </button>
        </form>
      </main>
    </>
  );
}
