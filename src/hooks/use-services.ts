"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { services } from "@/services";
export function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: services.snapshot,
    staleTime: Infinity,
  });
}
export function useAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSettled: () => client.invalidateQueries({ queryKey: ["snapshot"] }),
  });
}
