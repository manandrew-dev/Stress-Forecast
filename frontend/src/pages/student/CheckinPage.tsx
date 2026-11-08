import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BedDouble, HeartHandshake, Info, Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import type { CheckinResponse } from "@/api/types";
import { PageHeader } from "@/components/PageHeader";
import { StressMeter } from "@/components/StressMeter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Minimal Web Speech API typings (not in the TS DOM lib).
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function getSpeechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function useVoiceInput(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => setSupported(!!getSpeechCtor()), []);
  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      toast("Voice input isn't available in this browser. Try Chrome or Safari.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-CA";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal) chunk += r[0].transcript;
      }
      if (chunk.trim()) onText(chunk.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") toast.error("Microphone access was blocked.");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return { listening, supported, toggle };
}

function CareMessage() {
  return (
    <div className="rounded-2xl bg-care p-5 text-care-foreground">
      <div className="flex items-start gap-3">
        <HeartHandshake className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-3 text-sm leading-relaxed">
          <p className="font-display text-lg font-semibold">It sounds like things are really heavy right now.</p>
          <p>
            You don't have to carry this alone. Talking to someone can help, even if it feels like a small
            step.
          </p>
          <ul className="space-y-1.5">
            <li>
              <strong>Campus counselling</strong> — book a same-day appointment through your student
              services office.
            </li>
            <li>
              <strong>Call or text 9-8-8</strong> — Suicide Crisis Helpline, free and available 24/7.
            </li>
            <li>
              <strong>Here2Talk</strong> — free 24/7 support for BC post-secondary students: 1-877-857-3397.
            </li>
            <li>
              If you're in immediate danger, call <strong>9-1-1</strong>.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Result({ result, onAgain }: { result: CheckinResponse; onAgain: () => void }) {
  return (
    <div className="animate-rise space-y-4">
      {result.replaced_earlier && (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" />
          This replaced your earlier check-in from today.
        </div>
      )}
      {result.concerning && <CareMessage />}
      <Card className="space-y-6 p-5 sm:p-6">
        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground">Stress today</p>
          <StressMeter value={result.stress} />
        </div>
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft">
              <BedDouble className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Sleep</p>
              <p className="font-semibold">
                {result.sleep_hours === null ? "Not mentioned" : `${result.sleep_hours} hours`}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-muted-foreground">What's weighing on you</p>
            {result.causes.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.causes.map((c) => (
                  <Badge key={c} variant="deadline">
                    {c}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm">Nothing specific</p>
            )}
          </div>
        </div>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link to="/student/trend">See my trend</Link>
        </Button>
        <Button variant="ghost" onClick={onAgain}>
          <RotateCcw /> Redo today's check-in
        </Button>
      </div>
    </div>
  );
}

export function CheckinPage() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();
  const voice = useVoiceInput((chunk) => setText((t) => (t ? `${t} ${chunk}` : chunk)));

  const submit = useMutation({
    mutationFn: () => api.checkin(text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["trend"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Daily check-in"
        title="How are you feeling today?"
        description="Say it however you like — how you slept, what's on your plate, how you're doing."
      />

      {submit.data ? (
        <Result
          result={submit.data}
          onAgain={() => {
            submit.reset();
            setText("");
          }}
        />
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Pretty tired, only slept 5 hours. Midterm tomorrow and a lab due Friday…"
              className="min-h-40 resize-none border-0 bg-transparent p-1 pr-14 text-base shadow-none focus-visible:ring-0"
              aria-label="How are you feeling today?"
              disabled={submit.isPending}
            />
            <Button
              type="button"
              size="icon"
              variant={voice.listening ? "default" : "soft"}
              onClick={voice.toggle}
              disabled={submit.isPending}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Stop voice input" : "Speak instead of typing"}
              className={cn("absolute right-0 top-0", voice.listening && "animate-breathe")}
            >
              {voice.listening ? <MicOff /> : <Mic />}
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {voice.listening
                ? "Listening… tap the mic when you're done."
                : voice.supported
                  ? "Tap the mic to talk instead."
                  : "Private to you. Reps only ever see class averages."}
            </p>
            <Button onClick={() => submit.mutate()} disabled={!text.trim() || submit.isPending}>
              {submit.isPending ? "Reading…" : "Check in"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
