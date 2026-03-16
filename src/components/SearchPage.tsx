import uFuzzy from "@leeoniya/ufuzzy";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Promise } from "@/data/index";
import PromiseCard from "./PromiseCard";

export default function SearchPage({ promises }: { promises: Promise[] }) {
  const state = useRef<{ fuzzy: uFuzzy; haystack: string[] }>();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<number[]>();

  useEffect(() => {
    state.current = {
      fuzzy: new uFuzzy(),
      haystack: promises.map(
        (p) => `${p.name} ${p.description} ${p.party} ${p.tags} ${p.date}`,
      ),
    };
  }, []);

  useEffect(() => {
    if (input.trim() === "") {
      setResult(undefined);
      return;
    }

    const [ids] = state.current!.fuzzy.search(state.current!.haystack, input);
    setResult(ids ?? []);
  }, [input]);

  const list =
    result == undefined
      ? promises.map((p, i) => <PromiseCard key={i} promise={p} />)
      : result.map((idx) => (
          <PromiseCard key={idx} promise={promises[idx]} />
        ));

  return (
    <div className="container mx-auto pt-4 px-4 md:px-6">
      <Input
        type="text"
        placeholder="Sök"
        className="mb-4"
        value={input}
        onChange={(ev) => setInput(ev.target.value)}
      />
      <div>{list}</div>
    </div>
  );
}
