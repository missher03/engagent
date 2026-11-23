"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Trang Hỏi đáp cũ đã bỏ: phần Nói (Thi theo đề, Hỏi đáp tài liệu) thay thế. */
export default function Examiner() {
  const router = useRouter();
  useEffect(() => { router.replace("/speaking"); }, [router]);
  return null;
}
