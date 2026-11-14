import { llmsFullTxt, plain } from "@/app/lib/agent/docs";

// no request data is read, so this is prerendered at build time

export function GET() {
  return plain(llmsFullTxt());
}
