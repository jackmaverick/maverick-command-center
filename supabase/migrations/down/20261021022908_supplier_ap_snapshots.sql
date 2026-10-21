BEGIN;

DO $$
DECLARE
  sequence_name text;
BEGIN
  IF to_regclass('metrics.supplier_ap_snapshots') IS NOT NULL THEN
    IF to_regclass('metrics.supplier_ap_snapshots_rollback_20261021') IS NOT NULL THEN
      RAISE EXCEPTION
        'Rollback archive metrics.supplier_ap_snapshots_rollback_20261021 already exists';
    END IF;

    ALTER TABLE metrics.supplier_ap_snapshots
      RENAME TO supplier_ap_snapshots_rollback_20261021;

    IF to_regclass('metrics.supplier_ap_snapshots_latest_idx') IS NOT NULL THEN
      ALTER INDEX metrics.supplier_ap_snapshots_latest_idx
        RENAME TO supplier_ap_snapshots_rollback_20261021_latest_idx;
    END IF;

    sequence_name := pg_get_serial_sequence(
      'metrics.supplier_ap_snapshots_rollback_20261021',
      'id'
    );
    IF sequence_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER SEQUENCE %s RENAME TO supplier_ap_snapshots_rollback_20261021_id_seq',
        sequence_name
      );
    END IF;

    REVOKE ALL ON metrics.supplier_ap_snapshots_rollback_20261021
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $$;

COMMIT;
