"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "react-hot-toast";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function CouponsPage() {
  const [redeemingCouponId, setRedeemingCouponId] =
    useState<Id<"coupons"> | null>(null);
  const myCoupons = useQuery(api.coupons.getMyCoupons);
  const redeemCoupon = useMutation(api.coupons.redeemCoupon);

  const handleRedeemCoupon = async (couponId: Id<"coupons">) => {
    try {
      setRedeemingCouponId(couponId);
      const result = await redeemCoupon({ couponId });
      toast.success(
        `Coupon redeemed successfully!\nRedemption code: ${result.code}`,
      );
    } catch (error) {
      toast.error(
        `Failed to redeem coupon\n${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setRedeemingCouponId(null);
    }
  };

  if (myCoupons === undefined) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (myCoupons.length === 0) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">My Coupons</h1>
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No coupons found</AlertTitle>
          <AlertDescription>
            You don&apos;t have any coupons yet. Win an auction to receive
            coupons!
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">My Coupons</h1>

      <div className="space-y-8">
        {myCoupons.map((bundle) => (
          <Card key={bundle.bundle._id}>
            <CardHeader>
              <CardTitle>
                {bundle.auction?.title || "Unnamed Auction"}
              </CardTitle>
              <CardDescription>
                {bundle.bundle.description} ({bundle.bundle.quantity} coupons)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bundle.coupons.map((coupon) => (
                  <Card key={coupon._id} className="border border-gray-200">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg font-medium">
                          {coupon.isRedeemed ? "Coupon Code" : "Unused Coupon"}
                        </CardTitle>
                        {coupon.isRedeemed ? (
                          <Badge
                            variant="default"
                            className="bg-green-100 text-green-800"
                          >
                            Redeemed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-blue-100 text-blue-800"
                          >
                            Available
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {coupon.isRedeemed ? (
                        <p className="text-lg font-mono">{coupon.code}</p>
                      ) : (
                        <p className="text-sm text-gray-500">
                          Click &quot;Redeem Now&quot; to generate your unique
                          coupon code
                        </p>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button
                        className="w-full"
                        variant={coupon.isRedeemed ? "outline" : "default"}
                        disabled={
                          coupon.isRedeemed || redeemingCouponId === coupon._id
                        }
                        onClick={() => handleRedeemCoupon(coupon._id)}
                      >
                        {redeemingCouponId === coupon._id ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span className="ml-2">Redeeming...</span>
                          </>
                        ) : coupon.isRedeemed ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Redeemed on{" "}
                            {new Date(
                              coupon.redeemedAt as number,
                            ).toLocaleDateString()}
                          </>
                        ) : (
                          "Redeem Now"
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
