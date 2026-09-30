<?php
/**
 * TAMASYA DAILY SUMMARY — ringkasan operasional harian (JSON).
 * Endpoint read-only untuk dashboard/laporan; tidak mengubah data.
 * Action: ?action=daily-summary&date=YYYY-MM-DD (default hari ini)
 *
 * Output: occupancy %, income/expense/PBJT, tamu checkin/checkout, HK pending.
 */

if (!function_exists('tamasyaDailySummary')) {
    /**
     * @return array<string,mixed>
     */
    function tamasyaDailySummary(PDO $pdo, string $date): array
    {
        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : date('Y-m-d');
        $out = ['success' => true, 'date' => $date];

        // Rooms & occupancy
        $totalRooms = (int) $pdo->query('SELECT COUNT(*) FROM rooms')->fetchColumn();
        $occupied = (int) $pdo->query("SELECT COUNT(*) FROM bookings WHERE status='active'")->fetchColumn();
        $out['rooms_total']    = $totalRooms;
        $out['rooms_occupied'] = $occupied;
        $out['occupancy_pct']  = $totalRooms > 0 ? round($occupied / $totalRooms * 100, 1) : 0.0;

        // Financials for the date (ledger)
        $stmt = $pdo->prepare(
            "SELECT
                COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
                COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense,
                COALESCE(SUM(CASE WHEN taxAmount>0 THEN taxAmount END),0) AS pbjt
             FROM transactions WHERE DATE(`date`)=?"
        );
        $stmt->execute([$date]);
        $fin = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $out['income']  = round((float)($fin['income'] ?? 0), 2);
        $out['expense'] = round((float)($fin['expense'] ?? 0), 2);
        $out['net']     = round($out['income'] - $out['expense'], 2);
        $out['pbjt']    = round((float)($fin['pbjt'] ?? 0), 2);

        // Guest movement
        $ci = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE DATE(actualCheckInAt)=?");
        $ci->execute([$date]);
        $co = $pdo->prepare("SELECT COUNT(*) FROM bookings WHERE DATE(actualCheckOutAt)=?");
        $co->execute([$date]);
        $out['checkins']  = (int) $ci->fetchColumn();
        $out['checkouts'] = (int) $co->fetchColumn();

        // Housekeeping pending
        // Housekeeping pending = kamar berstatus perlu cleaning (canonical: rooms.status)
        $hk = $pdo->query("SELECT COUNT(*) FROM rooms WHERE status IN ('dirty','cleaning')");
        $out['housekeeping_pending'] = (int) $hk->fetchColumn();

        return $out;
    }
}
