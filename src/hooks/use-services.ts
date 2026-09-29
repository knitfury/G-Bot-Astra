"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { services } from "@/services";
export function useSnapshot() {
  return useQuery({
    networkMode: "always", // Local/native state is readable while offline.
    queryKey: ["snapshot"],
    queryFn: services.snapshot,
    staleTime: Infinity,
  });
}
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    networkMode: "always", // Services own network checks; local preferences must not queue offline.
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSettled: () => client.invalidateQueries({ queryKey: ["snapshot"] }),
  });
}
