import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, FileText, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { DEADLINE_TYPES, type DeadlineDraft, type DeadlineType } from "@/api/types";
import { TYPE_LABEL } from "@/components/DeadlineRow";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, Spinner } from "@/components/StateViews";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useMe } from "./useMe";

type Row = DeadlineDraft & { key: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const weightOk = (w: number | null) => w === null || (Number.isFinite(w) && w >= 0 && w <= 100);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const STEPS = [
  "Reading your syllabus…",
  "Finding dates and deadlines…",
  "Working out grade weights…",
  "Tidying things up…",
];

function ParsingState() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 0.25), 250);
    return () => clearInterval(t);
  }, []);
  const step = Math.min(STEPS.length - 1, Math.floor(elapsed / 3.5));
  // Eases toward 95% over ~15 seconds, never claiming to be done early.
  const pct = Math.min(95, 100 * (1 - Math.exp(-elapsed / 6)));
  return (
    <Card
      className="flex flex-col items-center gap-5 px-6 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="animate-breathe flex size-16 items-center justify-center rounded-full bg-primary-soft">
        <FileText className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <p className="font-display text-xl font-semibold">{STEPS[step]}</p>
        <p className="text-sm text-muted-foreground">
          This can take up to 15 seconds. Feel free to stretch.
        </p>
      </div>
      <Progress value={pct} className="h-2 w-full max-w-xs" />
    </Card>
  );
}

function DeadlineEditor({
  rows,
  setRows,
}: {
  rows: Row[];
  setRows: (fn: (rows: Row[]) => Row[]) => void;
}) {
  const update = (key: string, patch: Partial<DeadlineDraft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1fr_10rem_6rem_9rem_2.5rem] gap-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
        <span>Title</span>
        <span>Due date</span>
        <span>Weight %</span>
        <span>Type</span>
        <span className="sr-only">Delete</span>
      </div>
      {rows.map((r, i) => {
        const titleBad = !r.title.trim();
        const dateBad = !DATE_RE.test(r.due_date);
        const weightBad = !weightOk(r.weight_pct);
        return (
          <div
            key={r.key}
            className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-3 shadow-soft md:grid-cols-[1fr_10rem_6rem_9rem_2.5rem] md:items-center md:rounded-xl md:border-transparent md:bg-transparent md:p-0 md:shadow-none"
          >
            <div className="col-span-2 md:col-span-1">
              <Label
                htmlFor={`t-${r.key}`}
                className="mb-1 text-xs text-muted-foreground md:sr-only"
              >
                Title
              </Label>
              <Input
                id={`t-${r.key}`}
                value={r.title}
                onChange={(e) => update(r.key, { title: e.target.value })}
                aria-invalid={titleBad}
                className={cn("bg-card", titleBad && "border-destructive")}
                placeholder={`Deadline ${i + 1}`}
              />
            </div>
            <div>
              <Label
                htmlFor={`d-${r.key}`}
                className="mb-1 text-xs text-muted-foreground md:sr-only"
              >
                Due date
              </Label>
              <Input
                id={`d-${r.key}`}
                type="date"
                value={r.due_date}
                onChange={(e) => update(r.key, { due_date: e.target.value })}
                aria-invalid={dateBad}
                className={cn("bg-card", dateBad && "border-destructive")}
              />
            </div>
            <div>
              <Label
                htmlFor={`w-${r.key}`}
                className="mb-1 text-xs text-muted-foreground md:sr-only"
              >
                Weight %
              </Label>
              <Input
                id={`w-${r.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={r.weight_pct ?? ""}
                placeholder="—"
                onChange={(e) =>
                  update(r.key, {
                    weight_pct: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                aria-invalid={weightBad}
                title={weightBad ? "Weight must be between 0 and 100" : undefined}
                className={cn("bg-card", weightBad && "border-destructive")}
              />
            </div>
            <div className="col-span-2 flex items-end gap-2 md:contents">
              <div className="flex-1">
                <Label className="mb-1 text-xs text-muted-foreground md:sr-only">Type</Label>
                <Select
                  value={r.type}
                  onValueChange={(v) => update(r.key, { type: v as DeadlineType })}
                >
                  <SelectTrigger className="bg-card" aria-label="Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEADLINE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(r.key)}
                aria-label={`Delete ${r.title || "row"}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setRows((rs) => [
            ...rs,
            {
              key: crypto.randomUUID(),
              title: "",
              due_date: "",
              weight_pct: null,
              type: "assignment",
            },
          ])
        }
      >
        <Plus /> Add a deadline
      </Button>
    </div>
  );
}

export function SyllabusPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [mode, setMode] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [rows, setRowsState] = useState<Row[] | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const setRows = (fn: (rows: Row[]) => Row[]) => setRowsState((rs) => fn(rs ?? []));

  const courses = me.data?.courses ?? [];
  const course = courses.find((c) => String(c.id) === courseId);

  const parse = useMutation({
    mutationFn: () => {
      const id = Number(courseId);
      return mode === "file" && file
        ? api.uploadSyllabus({ course_id: id, file })
        : api.uploadSyllabus({ course_id: id, text });
    },
    onSuccess: (res) => {
      setSavedCount(null);
      setRowsState(res.deadlines.map((d) => ({ ...d, key: crypto.randomUUID() })));
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: () =>
      api.saveDeadlines(
        Number(courseId),
        (rows ?? []).map(({ key: _key, ...d }) => ({ ...d, title: d.title.trim() })),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries();
      setSavedCount(res.deadlines.length);
      setRowsState(null);
      setFile(null);
      setText("");
      toast.success(`Saved ${plural(res.deadlines.length, "deadline")} for ${course?.code}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rowsValid =
    !!rows &&
    rows.length > 0 &&
    rows.every((r) => r.title.trim() && DATE_RE.test(r.due_date) && weightOk(r.weight_pct));
  const canParse = !!courseId && (mode === "file" ? !!file : text.trim().length > 0);

  if (me.isPending) return <Spinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Syllabus"
        title="Add your deadlines"
        description="Upload a syllabus and we'll pull out the dates. You can fix anything before saving."
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Pick your courses first"
          action={
            <Button asChild>
              <Link to="/student/courses">Choose courses</Link>
            </Button>
          }
        />
      ) : parse.isPending ? (
        <ParsingState />
      ) : rows ? (
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {plural(rows.length, "deadline")} found in {course?.code}
              </h2>
              <p className="text-sm text-muted-foreground">
                Check each one, then save. Saving replaces any deadlines you saved for{" "}
                {course?.code} before.
              </p>
            </div>
          </div>
          <DeadlineEditor rows={rows} setRows={setRows} />
          <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setRowsState(null)} disabled={save.isPending}>
              Start over
            </Button>
            <Button onClick={() => save.mutate()} disabled={!rowsValid || save.isPending}>
              {save.isPending ? "Saving…" : "Save deadlines"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-5 p-4 sm:p-6">
          {savedCount !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm">
              <CheckCircle2 className="size-4 text-primary" />
              {plural(savedCount, "deadline")} saved. Add another course's syllabus any time.
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="course">Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger id="course" className="h-11 bg-card">
                <SelectValue placeholder="Choose a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "file" | "text")}>
            <TabsList className="grid w-full grid-cols-2 rounded-full">
              <TabsTrigger value="file" className="rounded-full">
                Upload PDF
              </TabsTrigger>
              <TabsTrigger value="text" className="rounded-full">
                Paste text
              </TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-3">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                aria-label="Syllabus PDF"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setFile(e.dataTransfer.files[0] ?? null);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-input bg-muted/50 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Upload className="size-6 text-primary" />
                {file ? (
                  <>
                    <span className="font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Tap to choose a different file
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Choose a PDF or drop it here</span>
                    <span className="text-xs text-muted-foreground">
                      Your course syllabus or outline
                    </span>
                  </>
                )}
              </button>
            </TabsContent>
            <TabsContent value="text" className="pt-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the assessment section of your syllabus…"
                className="min-h-48 bg-card"
                aria-label="Syllabus text"
              />
            </TabsContent>
          </Tabs>

          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={() => parse.mutate()}
            disabled={!canParse}
          >
            Find deadlines
          </Button>
        </Card>
      )}
    </div>
  );
}
