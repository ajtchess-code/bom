import { NextRequest } from "next/server";
import { mapEditProxy } from "@/lib/mapEditProxy";
export const GET = (req: NextRequest) => mapEditProxy(req);
