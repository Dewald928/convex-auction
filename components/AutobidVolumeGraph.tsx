import React, { useState } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  ReferenceLine,
  ReferenceArea,
  Area,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AutobidVolumeGraphProps {
  autoBidOrderbook:
    | Array<{
        maxBidAmount: number;
        totalTargetCount: number;
        userCount: number;
      }>
    | undefined;
  activeAuctions:
    | Array<{
        _id: string;
        currentPrice: number;
        title: string;
        status: string;
      }>
    | undefined;
  leadingAutobids?:
    | Array<{
        maxBidAmount: number;
        leadingCount: number;
      }>
    | undefined;
}

export default function AutobidVolumeGraph({
  autoBidOrderbook,
  activeAuctions,
  leadingAutobids,
}: AutobidVolumeGraphProps) {
  const [chartType, setChartType] = useState<"composed" | "simple">("composed");
  const [showDebug, setShowDebug] = useState(false);
  const [minimumPrice, setMinimumPrice] = useState<number>(50); // Default minimum price

  console.log("AutobidVolumeGraph props:", {
    autoBidOrderbook,
    activeAuctions,
    leadingAutobids,
  });

  if (!autoBidOrderbook || !activeAuctions) {
    console.log("Missing data, showing loading state");
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Autobid Volume Analysis</CardTitle>
          <CardDescription>
            Loading data for autobid volume and active auctions...
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <p className="text-muted-foreground">Loading chart data...</p>
        </CardContent>
      </Card>
    );
  }

  // Check if we have any data to display
  if (autoBidOrderbook.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Autobid Volume Analysis</CardTitle>
          <CardDescription>No active autobids found to analyze</CardDescription>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <p className="text-muted-foreground">
            Create an autobid to see volume analysis
          </p>
        </CardContent>
      </Card>
    );
  }

  // Count active auctions by price range
  const auctionPriceBuckets: Record<string, number> = {};
  const activeAuctionCount = activeAuctions.filter(
    (auction) => auction.status === "active",
  ).length;

  // Calculate total active auction volume (sum of all active auction current prices)
  const totalActiveAuctionVolume = activeAuctions
    .filter((auction) => auction.status === "active")
    .reduce((sum, auction) => sum + auction.currentPrice, 0);

  console.log("Active auction count:", activeAuctionCount);
  console.log("Total active auction volume:", totalActiveAuctionVolume);

  // Sort the orderbook by max bid amount (ascending)
  const sortedOrderbook = [...(autoBidOrderbook || [])].sort(
    (a, b) => a.maxBidAmount - b.maxBidAmount,
  );

  // Process data for the chart
  const chartData = sortedOrderbook.map((entry, index) => {
    // Calculate the ratio of max bid amount to target auctions
    // This represents the "autobid volume" per price point
    const autobidVolume = entry.maxBidAmount * entry.totalTargetCount;

    // Find active auctions in this price range
    // For each price point, count auctions from the previous max bid amount to this one
    let lowerBound = 0; // Default to 0 for the first entry
    if (index > 0) {
      lowerBound = sortedOrderbook[index - 1].maxBidAmount;
    }
    const upperBound = entry.maxBidAmount;

    const matchingAuctions = activeAuctions.filter(
      (auction) =>
        auction.status === "active" &&
        auction.currentPrice > lowerBound &&
        auction.currentPrice <= upperBound,
    );

    // Calculate the total volume of matching auctions
    const auctionVolume = matchingAuctions.reduce(
      (sum, auction) => sum + auction.currentPrice,
      0,
    );

    const priceKey = `$${entry.maxBidAmount}`;
    auctionPriceBuckets[priceKey] = matchingAuctions.length;

    return {
      price: priceKey,
      autobidVolume: autobidVolume,
      targetAuctions: entry.totalTargetCount,
      activeAuctions: matchingAuctions.length,
      auctionVolume: auctionVolume,
      volumeRatio: autobidVolume / (auctionVolume || 1),
      userCount: entry.userCount,
      lowerBound: lowerBound,
      upperBound: upperBound,
    };
  });

  console.log("Chart data:", chartData);

  // Calculate total autobid volume
  const totalAutobidVolume = chartData.reduce(
    (sum, item) => sum + item.autobidVolume,
    0,
  );

  // Calculate total target auctions
  const totalTargetAuctions = chartData.reduce(
    (sum, item) => sum + item.targetAuctions,
    0,
  );

  // Calculate desired volume (only from autobids at or above minimum price)
  const desiredVolume = chartData
    .filter((item) => {
      // Extract numeric value from price string (remove $ sign)
      const price = parseFloat(item.price.replace("$", ""));
      return price >= minimumPrice;
    })
    .reduce((sum, item) => sum + item.autobidVolume, 0);

  // Calculate the ratio of desired volume to auction volume
  const desiredVolumeRatio = desiredVolume / (totalActiveAuctionVolume || 1);
  const formattedDesiredRatio = desiredVolumeRatio.toFixed(2);

  console.log(
    "Desired volume:",
    desiredVolume,
    "Ratio:",
    formattedDesiredRatio,
  );

  // Calculate the ratio of autobid volume to auction volume
  const volumeRatio = totalAutobidVolume / (totalActiveAuctionVolume || 1);
  const formattedRatio = volumeRatio.toFixed(2);

  console.log("Totals:", {
    totalAutobidVolume,
    totalTargetAuctions,
    volumeRatio,
  });

  // Prepare data for cumulative target auctions vs price (from highest to lowest price)
  const cumulativeData: Array<{
    price: number;
    cumulativeTargetAuctions: number;
    maxBidAmount: number;
    leadingAutobids?: number;
    cumulativeLeadingAutobids?: number;
  }> = [];
  let cumulativeTargetAuctions = 0;
  let cumulativeLeadingAutobids = 0;

  // Process in reverse order (highest to lowest price)
  for (let i = sortedOrderbook.length - 1; i >= 0; i--) {
    const entry = sortedOrderbook[i];
    cumulativeTargetAuctions += entry.totalTargetCount;

    // Find leading autobids at this price point if available
    const leadingCount =
      leadingAutobids?.find((item) => item.maxBidAmount === entry.maxBidAmount)
        ?.leadingCount || 0;

    // Add to cumulative leading autobids
    cumulativeLeadingAutobids += leadingCount;

    cumulativeData.push({
      price: entry.maxBidAmount,
      cumulativeTargetAuctions,
      maxBidAmount: entry.maxBidAmount,
      leadingAutobids: leadingCount,
      cumulativeLeadingAutobids: cumulativeLeadingAutobids,
    });
  }

  // Reverse the array so that highest price comes first
  cumulativeData.reverse();

  // Find the price point where cumulative target auctions equals or exceeds active auction count
  // Since we're going from high to low price, we need to find the highest price where
  // cumulative target auctions >= active auction count
  let intersectionPrice = 0;

  // If there are no active auctions, set intersection to the highest price
  if (activeAuctionCount === 0 && cumulativeData.length > 0) {
    intersectionPrice = cumulativeData[cumulativeData.length - 1].price;
  } else {
    // Start from the highest price (first element) and find where cumulative target auctions >= active auction count
    for (const data of cumulativeData) {
      if (data.cumulativeTargetAuctions <= activeAuctionCount) {
        intersectionPrice = data.price;
        break;
      }
    }
  }

  // If no intersection found (all cumulative values are less than active auction count)
  // use the lowest price point
  if (intersectionPrice === 0 && cumulativeData.length > 0) {
    intersectionPrice = cumulativeData[cumulativeData.length - 1].price;
  }

  console.log(
    "Intersection price:",
    intersectionPrice,
    "Active auction count:",
    activeAuctionCount,
  );

  // Calculate min and max values for x-axis
  const minPrice =
    cumulativeData.length > 0
      ? cumulativeData[cumulativeData.length - 1].price
      : 0;
  const maxPrice = cumulativeData.length > 0 ? cumulativeData[0].price : 100;

  // Add padding to the min and max values (10% of the range)
  const pricePadding = (maxPrice - minPrice) * 0.1;
  const xAxisDomain = [
    maxPrice + pricePadding,
    Math.max(0, minPrice - pricePadding),
  ];

  // Calculate max value for y-axis with padding
  const maxCumulativeTarget =
    cumulativeData.length > 0
      ? cumulativeData[cumulativeData.length - 1].cumulativeTargetAuctions
      : 10;
  const yAxisDomain = [0, Math.ceil(maxCumulativeTarget * 1.1)];

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Autobid Volume Analysis</CardTitle>
        <CardDescription>
          Visualizing autobid volume (max bid amount × target auctions) and
          active auction distribution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">
              Total Autobid Volume
            </p>
            <p className="text-2xl font-bold">
              ${totalAutobidVolume.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">
              Desired Volume (≥${minimumPrice})
            </p>
            <p className="text-2xl font-bold">
              ${desiredVolume.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">Target Auctions</p>
            <p className="text-2xl font-bold">{totalTargetAuctions}</p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">Active Auctions</p>
            <p className="text-2xl font-bold">{activeAuctionCount}</p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">
              Active Auction Volume
            </p>
            <p className="text-2xl font-bold">
              ${totalActiveAuctionVolume.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
            <p className="text-sm text-muted-foreground">Volume Ratio</p>
            <div>
              <p
                className={`text-2xl font-bold ${desiredVolumeRatio > 1 ? "text-red-500" : "text-green-500"}`}
              >
                {formattedDesiredRatio}x
              </p>
              <p className="text-xs text-muted-foreground">
                (Desired Volume / Auction Volume)
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="minimumPrice" className="text-sm font-medium">
                Minimum Desired Price:
              </label>
              <div className="flex items-center">
                <span className="mr-1">$</span>
                <input
                  id="minimumPrice"
                  type="number"
                  min="0"
                  step="1"
                  value={minimumPrice}
                  onChange={(e) => setMinimumPrice(Number(e.target.value))}
                  className="w-24 h-8 px-2 border rounded"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Find the highest price in the data
                  if (cumulativeData.length > 0) {
                    setMinimumPrice(cumulativeData[0].price);
                  }
                }}
              >
                Set to Highest
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Find the intersection price
                  setMinimumPrice(intersectionPrice);
                }}
              >
                Set to Intersection
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="volume" className="mb-4">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="volume">Volume Analysis</TabsTrigger>
            <TabsTrigger value="price-target">Price vs Target</TabsTrigger>
            <TabsTrigger value="ratio">Price/Target Ratio</TabsTrigger>
            <TabsTrigger value="auction-volume">Auction Volume</TabsTrigger>
          </TabsList>
          <TabsContent value="volume">
            <div className="mb-4 flex justify-end">
              <Button
                variant={chartType === "composed" ? "default" : "outline"}
                size="sm"
                className="mr-2"
                onClick={() => setChartType("composed")}
              >
                Combined Chart
              </Button>
              <Button
                variant={chartType === "simple" ? "default" : "outline"}
                size="sm"
                className="mr-2"
                onClick={() => setChartType("simple")}
              >
                Simple Chart
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDebug(!showDebug)}
              >
                {showDebug ? "Hide Debug" : "Show Debug"}
              </Button>
            </div>

            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "composed" ? (
                  <ComposedChart
                    data={chartData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="price" />
                    <YAxis
                      yAxisId="left"
                      orientation="left"
                      label={{
                        value: "Volume ($)",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      label={{
                        value: "Count",
                        angle: 90,
                        position: "insideRight",
                      }}
                    />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "Autobid Volume")
                          return [`$${value.toLocaleString()}`, name];
                        return [value, name];
                      }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <p className="font-semibold">
                                Price: {data.price}
                              </p>
                              <p>
                                Autobid Volume: $
                                {data.autobidVolume.toLocaleString()}
                              </p>
                              <p>Target Auctions: {data.targetAuctions}</p>
                              <p>Active Auctions: {data.activeAuctions}</p>
                              <p>User Count: {data.userCount}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Price Range: ${data.lowerBound} to $
                                {data.upperBound}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="autobidVolume"
                      name="Autobid Volume"
                      fill="#8884d8"
                      barSize={40}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="targetAuctions"
                      name="Target Auctions"
                      fill="#ff4500"
                      barSize={30}
                      stackId="a"
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="activeAuctions"
                      name="Active Auctions"
                      fill="#00bcd4"
                      barSize={30}
                      stackId="a"
                    />

                    {/* Vertical line for minimum price */}
                    <ReferenceLine
                      x={`$${minimumPrice}`}
                      yAxisId="left"
                      stroke="#4CAF50"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      label={{
                        value: `Min $${minimumPrice}`,
                        position: "top",
                        fill: "#4CAF50",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    />
                  </ComposedChart>
                ) : (
                  <BarChart
                    data={chartData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="price" />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name) => {
                        if (name === "Autobid Volume")
                          return [`$${value.toLocaleString()}`, name];
                        return [value, name];
                      }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <p className="font-semibold">
                                Price: {data.price}
                              </p>
                              <p>
                                Autobid Volume: $
                                {data.autobidVolume.toLocaleString()}
                              </p>
                              <p>Target Auctions: {data.targetAuctions}</p>
                              <p>Active Auctions: {data.activeAuctions}</p>
                              <p>User Count: {data.userCount}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                Price Range: ${data.lowerBound} to $
                                {data.upperBound}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="targetAuctions"
                      name="Target Auctions"
                      fill="#ff4500"
                    />
                    <Bar
                      dataKey="activeAuctions"
                      name="Active Auctions"
                      fill="#00bcd4"
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </TabsContent>
          <TabsContent value="price-target">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cumulativeData}
                  margin={{
                    top: 20,
                    right: 50,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="colorCumulative"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#8884d8"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                    <linearGradient
                      id="colorLeading"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                      <stop
                        offset="95%"
                        stopColor="#82ca9d"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="price"
                    name="Max Bid Amount"
                    unit="$"
                    domain={xAxisDomain}
                    tickFormatter={(value) => `$${value}`}
                    label={{
                      value: "Max Bid Amount ($) - High to Low",
                      position: "insideBottomRight",
                      offset: -5,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="cumulativeTargetAuctions"
                    name="Cumulative Target Auctions"
                    domain={yAxisDomain}
                    allowDecimals={false}
                    label={{
                      value: "Cumulative Target Auctions",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === "Max Bid Amount") return [`$${value}`, name];
                      if (name === "Leading Autobids") return [value, name];
                      return [value, name];
                    }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-sm">
                            <p className="font-semibold">
                              Max Bid Amount: ${data.price}
                            </p>
                            <p>
                              Cumulative Target Auctions:{" "}
                              {data.cumulativeTargetAuctions}
                            </p>
                            {data.cumulativeLeadingAutobids !== undefined && (
                              <p>
                                Cumulative Leading Autobids:{" "}
                                {data.cumulativeLeadingAutobids}
                              </p>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />

                  {/* Area under the line */}
                  <Area
                    type="monotone"
                    dataKey="cumulativeTargetAuctions"
                    name="Cumulative Target Auctions"
                    stroke="#8884d8"
                    strokeWidth={3}
                    fill="url(#colorCumulative)"
                    dot={{ r: 4, fill: "#8884d8" }}
                    activeDot={{ r: 6, fill: "#8884d8" }}
                  />

                  {/* Line for active and leading autobids */}
                  {leadingAutobids && (
                    <Area
                      type="monotone"
                      dataKey="cumulativeLeadingAutobids"
                      name="Leading Autobids"
                      stroke="#82ca9d"
                      strokeWidth={3}
                      fill="url(#colorLeading)"
                      dot={{ r: 4, fill: "#82ca9d" }}
                      activeDot={{ r: 6, fill: "#82ca9d" }}
                    />
                  )}

                  {/* Vertical line for intersection point */}
                  <ReferenceLine
                    x={intersectionPrice}
                    stroke="#ff4500"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    isFront={true}
                    label={{
                      value: `$${intersectionPrice}`,
                      position: "top",
                      fill: "#ff4500",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  />

                  {/* Horizontal line for active auction count */}
                  <ReferenceLine
                    y={activeAuctionCount}
                    stroke="#00bcd4"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    isFront={true}
                    label={{
                      value: `${activeAuctionCount} Auctions`,
                      position: "right",
                      fill: "#00bcd4",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  />

                  {/* Highlight the intersection point */}
                  <ReferenceArea
                    x1={intersectionPrice}
                    x2={maxPrice + pricePadding}
                    y1={0}
                    y2={activeAuctionCount}
                    fill="#ff45001a"
                    fillOpacity={0.3}
                    stroke="none"
                  />

                  {/* Vertical line for minimum price */}
                  <ReferenceLine
                    x={minimumPrice}
                    stroke="#4CAF50"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    isFront={true}
                    label={{
                      value: `Min $${minimumPrice}`,
                      position: "top",
                      fill: "#4CAF50",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              <p>
                This chart shows the cumulative target auction count as a line
                graph, with max bid amount decreasing from high to low. The
                intersection of the vertical and horizontal lines indicates the
                highest price point where cumulative demand meets or exceeds the
                current supply.
              </p>
              <p className="mt-1">
                <span className="inline-block w-3 h-3 bg-[#8884d8] mr-1"></span>
                <strong>Cumulative Target Auctions</strong>: Total number of
                auctions users want to win at or above each price point
              </p>
              {leadingAutobids && (
                <p className="mt-1">
                  <span className="inline-block w-3 h-3 bg-[#82ca9d] mr-1"></span>
                  <strong>Leading Autobids</strong>: Cumulative number of
                  auctions where autobids are currently leading with the highest
                  bid at or above each price point
                </p>
              )}
              <p className="mt-1">
                <span className="inline-block w-3 h-3 bg-[#ff4500] mr-1"></span>
                <strong>Vertical Red Line</strong>: Highest price point ($
                {intersectionPrice}) where cumulative demand meets or exceeds
                supply
              </p>
              <p className="mt-1">
                <span className="inline-block w-3 h-3 bg-[#4CAF50] mr-1"></span>
                <strong>Vertical Green Line</strong>: Minimum desired price ($
                {minimumPrice}) for calculating desired volume
              </p>
              <p className="mt-1">
                <span className="inline-block w-3 h-3 bg-[#00bcd4] mr-1"></span>
                <strong>Horizontal Line</strong>: Current number of active
                auctions ({activeAuctionCount})
              </p>
              <p className="mt-1">
                <span
                  className="inline-block w-3 h-3 bg-[#ff45001a] mr-1"
                  style={{ border: "1px solid #ff4500" }}
                ></span>
                <strong>Highlighted Area</strong>: Region where there&apos;s
                sufficient demand at higher prices
              </p>
            </div>
          </TabsContent>
          <TabsContent value="ratio">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedOrderbook.map((entry, index) => {
                    let lowerBound = 0;
                    if (index > 0) {
                      lowerBound = sortedOrderbook[index - 1].maxBidAmount;
                    }
                    return {
                      price: `$${entry.maxBidAmount}`,
                      ratio: entry.maxBidAmount / entry.totalTargetCount,
                      userCount: entry.userCount,
                      lowerBound: lowerBound,
                      upperBound: entry.maxBidAmount,
                    };
                  })}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="price" />
                  <YAxis
                    label={{
                      value: "Price per Target Auction ($)",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip
                    formatter={(value) => [
                      typeof value === "number"
                        ? `$${value.toFixed(2)}`
                        : value,
                      "Price per Target Auction",
                    ]}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-sm">
                            <p className="font-semibold">Price: {data.price}</p>
                            <p>
                              Price per Target Auction: ${data.ratio.toFixed(2)}
                            </p>
                            <p>User Count: {data.userCount}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Price Range: ${data.lowerBound} to $
                              {data.upperBound}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="ratio"
                    name="Price per Target Auction"
                    fill="#8884d8"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              <p>
                This chart shows the price-to-target ratio (price per target
                auction) for each max bid amount. Higher values indicate users
                are willing to pay more per auction at that price point.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="auction-volume">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 5,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="price" />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    label={{
                      value: "Volume ($)",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    label={{
                      value: "Count",
                      angle: 90,
                      position: "insideRight",
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-2 border rounded shadow-sm">
                            <p className="font-semibold">Price: {data.price}</p>
                            <p>
                              Autobid Volume: $
                              {data.autobidVolume.toLocaleString()}
                            </p>
                            <p>
                              Active Auction Volume: $
                              {data.auctionVolume.toLocaleString()}
                            </p>
                            <p>Active Auctions: {data.activeAuctions}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Price Range: ${data.lowerBound} to $
                              {data.upperBound}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="auctionVolume"
                    name="Active Auction Volume"
                    fill="#00bcd4"
                    barSize={40}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="autobidVolume"
                    name="Autobid Volume"
                    fill="#8884d8"
                    barSize={40}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="activeAuctions"
                    name="Active Auction Count"
                    fill="#ff4500"
                    barSize={20}
                  />

                  {/* Vertical line for minimum price */}
                  <ReferenceLine
                    x={`$${minimumPrice}`}
                    yAxisId="left"
                    stroke="#4CAF50"
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    label={{
                      value: `Min $${minimumPrice}`,
                      position: "top",
                      fill: "#4CAF50",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              <p>
                This chart compares the total autobid volume with the actual
                active auction volume at each price point. It helps identify
                where there might be a mismatch between autobid demand and
                auction supply.
              </p>
              <p className="mt-1">
                <strong>Total Comparison:</strong> Autobid Volume ($
                {totalAutobidVolume.toLocaleString()}) vs. Active Auction Volume
                (${totalActiveAuctionVolume.toLocaleString()}) - Ratio:{" "}
                {formattedRatio}x
                {totalAutobidVolume > totalActiveAuctionVolume ? (
                  <span className="text-red-500"> More demand than supply</span>
                ) : (
                  <span className="text-green-500">
                    {" "}
                    Sufficient supply for demand
                  </span>
                )}
              </p>
              <div className="mt-2">
                <p className="font-medium">Volume Ratio by Price Point:</p>
                <div className="h-12 mt-1 flex">
                  {chartData.map((item, index) => (
                    <div
                      key={index}
                      className={`h-full flex-1 flex items-end justify-center text-xs ${
                        item.volumeRatio > 1 ? "bg-red-200" : "bg-green-200"
                      }`}
                      style={{
                        height: "100%",
                        position: "relative",
                      }}
                    >
                      <div
                        className={`${
                          item.volumeRatio > 1 ? "bg-red-500" : "bg-green-500"
                        }`}
                        style={{
                          height: `${Math.min(100, item.volumeRatio * 50)}%`,
                          width: "100%",
                        }}
                      ></div>
                      <span className="absolute bottom-0 text-[8px]">
                        {item.price}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span>Ratio &lt; 1: Supply exceeds demand</span>
                  <span>Ratio &gt; 1: Demand exceeds supply</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {showDebug && (
          <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-md overflow-auto max-h-80">
            <h3 className="font-semibold mb-2">Debug Data:</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium mb-1">Auto Bid Orderbook:</h4>
                <pre className="text-xs">
                  {JSON.stringify(autoBidOrderbook, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-medium mb-1">Chart Data:</h4>
                <pre className="text-xs">
                  {JSON.stringify(chartData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground">
          <p>
            <strong>Autobid Volume</strong>: Max bid amount × target auctions at
            each price point
          </p>
          <p>
            <strong>Target Auctions</strong>: Number of auctions users want to
            win at each price point
          </p>
          <p>
            <strong>Active Auctions</strong>: Number of currently active
            auctions with prices between the previous price point and this one
          </p>
          <p>
            <strong>Price Range</strong>: For each price point, auctions are
            counted from the previous max bid amount up to the current max bid
            amount
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
