import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GEMINI_API_KEY environment variable" },
      { status: 500 },
    );
  }

  try {
    const now = Date.now();
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpiresAt = new Date(now + 60 * 1000).toISOString();

    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: "v1alpha",
    });

    // Leave the Live session config unlocked so the browser can provide
    // dynamic tools and instructions for each connection.
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: expiresAt,
        newSessionExpireTime: newSessionExpiresAt,
      },
    });

    if (!token.name) {
      throw new Error("Token API did not return a token name");
    }

    return NextResponse.json(
      {
        ephemeralKey: token.name,
        expiresAt,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to generate Gemini ephemeral key", error);
    return NextResponse.json(
      { error: "Failed to generate Gemini ephemeral key" },
      { status: 500 },
    );
  }
}
