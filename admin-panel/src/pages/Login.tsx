import React, { useState, useEffect } from "react";
import { Lock, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { hasStoredPassword, verifyPassword, setPassword } from "@/lib/auth";
import { useLocation } from "wouter";

export default function Login() {
  const [isSetup, setIsSetup] = useState(!hasStoredPassword());
  const [password, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    try {
      if (isSetup) {
        await setPassword(password);
        toast({
          title: "Password Set",
          description: "Admin password has been configured successfully.",
          variant: "default",
        });
        setIsSetup(false);
        setPasswordInput("");
      } else {
        const isValid = await verifyPassword(password);
        if (isValid) {
          sessionStorage.setItem("isAdminAuthenticated", "true");
          setLocation("/");
        } else {
          toast({
            title: "Access Denied",
            description: "Incorrect password. The system has logged this attempt.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "System Error",
        description: "An unexpected error occurred during authentication.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground font-mono p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none opacity-50" />
      
      <div className="relative w-full max-w-md z-10">
        <div className="mb-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-primary/10 border border-primary flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(0,255,255,0.3)]">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">AliTerra Admin Panel</h1>
          <p className="text-muted-foreground text-sm mt-2">SECURE DEVELOPER TERMINAL</p>
        </div>

        <Card className="border-border bg-card shadow-2xl">
          <CardHeader className="border-b border-border bg-card/50">
            <CardTitle className="text-lg uppercase font-bold text-primary flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              {isSetup ? "INITIAL SETUP" : "SYSTEM LOGIN"}
            </CardTitle>
            <CardDescription className="text-xs font-mono text-muted-foreground uppercase">
              {isSetup 
                ? "Configure master password for this terminal." 
                : "Enter master password to unlock secure enclave."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-muted-foreground uppercase font-bold">
                  <span>PASSWORD</span>
                  <span className="text-primary/50 text-[10px]">SHA-256</span>
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="font-mono bg-background border-border text-foreground focus-visible:ring-primary focus-visible:border-primary shadow-inner"
                  placeholder="••••••••••••"
                  autoFocus
                  data-testid="input-password"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_15px_rgba(0,255,255,0.5)] transition-all"
                disabled={loading || !password}
                data-testid="button-submit-login"
              >
                {loading ? (
                  <span className="flex items-center gap-2">Processing...</span>
                ) : isSetup ? (
                  <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Set Password</span>
                ) : (
                  <span className="flex items-center gap-2">Unlock Terminal <ChevronRight className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <div className="mt-8 text-center text-xs text-muted-foreground font-mono opacity-50 flex flex-col items-center gap-1">
          <span>POLYGON MAINNET (CHAIN ID: 137)</span>
          <span>SYSTEM V1.0.0 // ENCRYPTED SESSION</span>
        </div>
      </div>
    </div>
  );
}
