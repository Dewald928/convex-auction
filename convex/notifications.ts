"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

// Set up nodemailer transport
// NOTE: In a production environment, you would use a real SMTP service
// This is just for development/demonstration purposes
const transporter = nodemailer.createTransport({
  host: "smtp.ethereal.email", // For testing purposes
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || "demo@example.com", // Add your real credentials in environment variables
    pass: process.env.EMAIL_PASS || "password",
  },
});

export const sendWinnerNotification = action({
  args: {
    auctionId: v.id("auctions"),
    winnerId: v.id("users"),
    winnerEmail: v.string(),
    auctionTitle: v.string(),
    finalPrice: v.number(),
    couponBundle: v.optional(
      v.object({
        quantity: v.number(),
        description: v.string(),
        couponCodes: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    try {
      // Prepare email content
      const mailOptions = {
        from: '"Auction Platform" <auctions@example.com>',
        to: args.winnerEmail,
        subject: `Congratulations! You won the auction for ${args.auctionTitle}`,
        html: `
          <h1>Congratulations!</h1>
          <p>You are the winner of the auction: <strong>${args.auctionTitle}</strong></p>
          <p>Final price: $${args.finalPrice.toFixed(2)}</p>
          ${
            args.couponBundle
              ? `
          <h2>Your Prize:</h2>
          <p>You have won <strong>${args.couponBundle.quantity} coupons</strong>!</p>
          <p>${args.couponBundle.description}</p>
          ${
            args.couponBundle.couponCodes
              ? `
          <h3>Your Coupon Codes:</h3>
          <ul>
            ${args.couponBundle.couponCodes.map((code) => `<li>${code}</li>`).join("")}
          </ul>
          `
              : ""
          }
          `
              : ""
          }
          <p>Please log in to your account to arrange payment and shipping details.</p>
          <p>Thank you for participating in our auction platform!</p>
        `,
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", info.messageId);

      return true;
    } catch (error) {
      console.error("Failed to send winner notification email:", error);
      return false;
    }
  },
});
