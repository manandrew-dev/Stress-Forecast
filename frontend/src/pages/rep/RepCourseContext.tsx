import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Course } from "@/api/types";

interface Value {
  courses: Course[];
  courseId: number | null;
  course: Course | null;
  setCourseId: (id: number | null) => void;
}

const Ctx = createContext<Value | null>(null);
const KEY = "stress-forecast:rep-course";

export function RepCourseProvider({ courses, children }: { courses: Course[]; children: ReactNode }) {
  const [courseId, setId] = useState<number | null>(null);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(KEY));
    if (saved && courses.some((c) => c.id === saved)) setId(saved);
  }, [courses]);

  const setCourseId = (id: number | null) => {
    setId(id);
    if (id === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(id));
  };

  const course = courses.find((c) => c.id === courseId) ?? null;
  return <Ctx.Provider value={{ courses, courseId: course?.id ?? null, course, setCourseId }}>{children}</Ctx.Provider>;
}

export function useRepCourse(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRepCourse must be used inside RepCourseProvider");
  return v;
}
