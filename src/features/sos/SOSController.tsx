"use client";

import { useState, useCallback } from "react";
import SOSAreaPanel, { type SOSAlert } from "@/components/SOSAreaPanel";
import SOSIssueSheet, { type SOSIssueType } from "@/components/SOSIssueSheet";
import SOSResolveSheet from "@/components/SOSResolveSheet";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getDeviceId } from "@/lib/identity";

interface SOSControllerProps {
  userCoords: { latitude: number; longitude: number } | null;
  onFlyTo: (target: { latitude: number; longitude: number; zoom?: number }) => void;
  onAlertsChange: (alerts: SOSAlert[]) => void;
  /** Called immediately when this device resolves an alert — for instant map cleanup */
  onAlertResolved?: (alertId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SOSController({
  userCoords,
  onFlyTo,
  onAlertsChange,
  onAlertResolved,
  open,
  onOpenChange,
}: SOSControllerProps) {
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [resolveAlertId, setResolveAlertId] = useState<string | null>(null);
  const [sosResolving, setSosResolving] = useState(false);

  const handleSOSSubmit = useCallback(
    async (issue: SOSIssueType, description: string, photo: File | null) => {
      setSosSubmitting(true);

      const broadcast = async (lat: number, lng: number) => {
        let photoUrl: string | null = null;
        if (photo) {
          const sb = getSupabaseBrowser();
          if (sb) {
            const ext = photo.name.split(".").pop() ?? "jpg";
            const path = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
            const { data, error } = await sb.storage
              .from("sos-photos")
              .upload(path, photo, { cacheControl: "3600", upsert: false });
            if (!error && data) {
              const {
                data: { publicUrl },
              } = sb.storage.from("sos-photos").getPublicUrl(data.path);
              photoUrl = publicUrl;
            }
          }
        }

        try {
          await fetch("/api/sos/broadcast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: getDeviceId(),
              lat,
              lng,
              issue,
              description,
              photo_url: photoUrl,
            }),
          });
        } finally {
          setSosSubmitting(false);
          onOpenChange(false);
        }
      };

      if (userCoords) {
        broadcast(userCoords.latitude, userCoords.longitude);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => broadcast(pos.coords.latitude, pos.coords.longitude),
        () => {
          setSosSubmitting(false);
          onOpenChange(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    },
    [userCoords, onOpenChange]
  );

  const handleSOSResolveSubmit = useCallback(
    async (description: string, photo: File | null) => {
      if (!resolveAlertId) return;
      setSosResolving(true);

      let photoUrl: string | null = null;
      if (photo) {
        const sb = getSupabaseBrowser();
        if (sb) {
          const ext = photo.name.split(".").pop() ?? "jpg";
          const path = `resolve-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { data, error } = await sb.storage
            .from("sos-photos")
            .upload(path, photo, { cacheControl: "3600", upsert: false });
          if (!error && data) {
            const {
              data: { publicUrl },
            } = sb.storage.from("sos-photos").getPublicUrl(data.path);
            photoUrl = publicUrl;
          }
        }
      }

      try {
        await fetch("/api/sos/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alert_id: resolveAlertId,
            user_id: getDeviceId(),
            description,
            photo_url: photoUrl,
          }),
        });
        // Immediately clear from THIS device's map — Realtime UPDATE handles all others
        onAlertResolved?.(resolveAlertId);
      } finally {
        setSosResolving(false);
        setResolveAlertId(null);
      }
    },
    [resolveAlertId]
  );

  return (
    <>
      <SOSAreaPanel
        userCoords={userCoords}
        onFlyTo={(coords) => onFlyTo({ ...coords })}
        onAlertsChange={onAlertsChange}
        onResolveClick={setResolveAlertId}
      />

      {open && (
        <SOSIssueSheet
          onSubmit={handleSOSSubmit}
          onClose={() => onOpenChange(false)}
          submitting={sosSubmitting}
        />
      )}

      {resolveAlertId && (
        <SOSResolveSheet
          onSubmit={handleSOSResolveSubmit}
          onClose={() => setResolveAlertId(null)}
          submitting={sosResolving}
        />
      )}
    </>
  );
}
