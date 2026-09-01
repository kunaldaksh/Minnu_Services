import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { CredentialStatus, CredentialValidation } from "@/lib/botTypes";
import { cn } from "@/lib/utils";

export default function ApiKeysDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [validation, setValidation] = useState<CredentialValidation | null>(null);
  const autoValidationAttempted = useRef(false);
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ["bot-credentials"],
    queryFn: () => apiGet<CredentialStatus>("/bot/credentials"),
    retry: false,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bot-credentials"] });
    queryClient.invalidateQueries({ queryKey: ["bot-state"] });
  };

  const validateKeys = useMutation({
    mutationFn: (next?: { api_key?: string; api_secret?: string }) => {
      const payload =
        next && (next.api_key || next.api_secret)
          ? {
              api_key: next.api_key ?? "",
              api_secret: next.api_secret ?? "",
            }
          : {};
      return apiPost<CredentialValidation>("/bot/credentials/validate", payload);
    },
    onSuccess: (data) => {
      setValidation(data);
      toast.success(data.message || "Credentials validated successfully");
      refresh();
    },
    onError: (err: any) => {
      setValidation(null);
      toast.error(err?.message || "Credential validation failed");
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const validated = await validateKeys.mutateAsync({ api_key: apiKey, api_secret: apiSecret });
      if (!validated.live_ready) {
        throw new Error(validated.message || "Credentials are invalid for live trading");
      }
      return apiPost<CredentialStatus>("/bot/credentials", { api_key: apiKey, api_secret: apiSecret });
    },
    onSuccess: () => {
      setApiKey("");
      setApiSecret("");
      setValidation(null);
      toast.success("API credentials validated and saved");
      refresh();
    },
    onError: (err: any) => {
      setValidation(null);
      toast.error(err?.message || "Could not validate and save the credentials");
    },
  });

  const remove = useMutation({
    mutationFn: () => apiDelete("/bot/credentials"),
    onSuccess: () => {
      toast.success("Credentials removed — back to PAPER mode");
      refresh();
    },
    onError: () => toast.error("Could not remove the credentials"),
  });

  const setLive = useMutation({
    mutationFn: (on: boolean) => apiPost<CredentialStatus>("/bot/credentials/live", { on }),
    onSuccess: (data) => {
      toast[data.live_trading ? "warning" : "success"](
        data.live_trading ? "LIVE ORDERS enabled — real money at risk" : "Switched back to PAPER mode",
      );
      setValidation(null);
      refresh();
    },
    onError: (err: any) => toast.error(err?.message || "Add a valid API key and secret before enabling live trading"),
  });

  const configured = status.data?.configured ?? false;
  const live = status.data?.live_trading ?? false;

  useEffect(() => {
    if (!open) {
      autoValidationAttempted.current = false;
      return;
    }
    if (configured && !autoValidationAttempted.current) {
      autoValidationAttempted.current = true;
      validateKeys.mutate({});
    }
  }, [open, configured]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            data-testid="api-keys-button"
            aria-label="API keys"
            title="API keys"
            className={cn(
              compact ? "flex h-7 items-center justify-center gap-1.5 px-2 text-[9px] font-medium" : "h-7 w-7 p-0",
              configured
                ? "border-[#00c076]/40 bg-[#00c076]/[0.08] text-[#6ee7b7] hover:bg-[#00c076]/[0.14]"
                : "border-slate-500/40 bg-slate-500/10 text-slate-300 hover:bg-slate-500/15",
            )}
          >
            <KeyRound className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            {compact ? <span>API key</span> : null}
          </Button>
        }
      />
      <DialogContent className="border-[#1e293b] bg-[#111724] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">CoinDCX API access</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a key at coindcx.com/api-dashboard with <b>Futures Trading + Read</b> only —
            never enable withdrawals. Keys are stored server-side and only ever shown masked.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-md border border-[#1e293b] bg-[#0b0e14] p-2.5">
            <p className="num text-[11px] text-slate-400" data-testid="credentials-status">
              {configured
                ? `Key ${status.data?.api_key_masked} · Secret ${status.data?.api_secret_masked}`
                : "No credentials stored — the bot simulates every fill (PAPER)."}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="api-key" className="text-xs text-slate-400">API key</Label>
            <Input
              id="api-key"
              data-testid="api-key-input"
              value={apiKey}
              autoComplete="off"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={configured ? "stored securely — enter only to replace" : "paste your API key"}
              className="num border-[#1e293b] bg-[#0b0e14] text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="api-secret" className="text-xs text-slate-400">API secret</Label>
            <Input
              id="api-secret"
              data-testid="api-secret-input"
              type="password"
              autoComplete="off"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={configured ? "stored securely — enter only to replace" : "paste your API secret"}
              className="num border-[#1e293b] bg-[#0b0e14] text-sm"
            />
          </div>

          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border p-2.5",
              live ? "border-[#ff455b]/40 bg-[#ff455b]/[0.07]" : "border-[#1e293b] bg-[#0b0e14]",
            )}
          >
            <div className="flex items-start gap-2">
              {live ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ff455b]" />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#00c076]" />
              )}
              <div>
                <p className="text-[12px] font-semibold text-slate-100">
                  {live ? "Live orders enabled" : "Paper mode"}
                </p>
                <p className="text-[10px] leading-snug text-slate-500">
                  {live
                    ? "Real orders will be placed with real money."
                    : "Every fill is simulated. Enable live trading only when you are ready."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={live ? "destructive" : "secondary"}
              data-testid="live-trading-toggle"
              disabled={setLive.isPending || (!configured && !live) || (!validation?.live_ready && !live)}
              onClick={() => {
                if (!live && validation?.live_ready) {
                  const confirmed = window.confirm("This will enable live CoinDCX orders with real money. Continue?");
                  if (!confirmed) return;
                }
                setLive.mutate(!live);
              }}
            >
              {live ? "Go paper" : "Go live"}
            </Button>
          </div>

          {validation && (
            <div className="rounded-md border border-[#00c076]/30 bg-[#00c076]/[0.06] p-2.5 text-[11px] text-slate-200">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-[#6ee7b7]">Validation status</span>
                <span className={validation.live_ready ? "text-[#6ee7b7]" : "text-[#ffb4b4]"}>
                  {validation.live_ready ? "Ready" : "Blocked"}
                </span>
              </div>
              <div className="space-y-1 text-slate-300">
                <div>CoinDCX INR free balance: ₹{Number(validation.wallet_balance_inr || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div>
                <div>Active INR instruments: {validation.active_instruments_count}</div>
                <div>Open positions: {validation.open_positions_count}</div>
                <div>USDT/INR: ₹{Number(validation.usdt_inr_rate || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</div>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{validation.message}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          {configured ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="delete-credentials-button"
              onClick={() => {
                setValidation(null);
                remove.mutate();
              }}
              className="text-[#ff455b] hover:text-[#ff455b]"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove keys
            </Button>
          ) : null}
          {configured && (
            <Button
              size="sm"
              variant="secondary"
              data-testid="validate-credentials-button"
              disabled={validateKeys.isPending || !configured}
              onClick={() => validateKeys.mutate({})}
            >
              Validate credentials
            </Button>
          )}
          <Button
            size="sm"
            data-testid="save-credentials-button"
            disabled={save.isPending || apiKey.trim().length < 8 || apiSecret.trim().length < 8}
            onClick={() => save.mutate()}
          >
            {configured ? "Replace credentials" : "Validate & save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
