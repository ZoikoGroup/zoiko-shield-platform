package com.zoiko.shieldcore.casework;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static com.zoiko.shieldcore.jooq.casework.Tables.CASE;
import static com.zoiko.shieldcore.jooq.casework.Tables.OUTBOX;

@Service
public class CaseService {

    private final DSLContext dsl;
    private final ObjectMapper objectMapper;

    public CaseService(DSLContext dsl, ObjectMapper objectMapper) {
        this.dsl = dsl;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void createCase(UUID tenantId, String title, String description, String severity, UUID assignedTo) throws Exception {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        UUID correlationId = UUID.randomUUID();

        // 1. Insert Business Row
        dsl.insertInto(CASE)
           .set(CASE.ID, id)
           .set(CASE.TENANT_ID, tenantId)
           .set(CASE.TITLE, title)
           .set(CASE.DESCRIPTION, description)
           .set(CASE.SEVERITY, severity)
           .set(CASE.STATUS, "OPEN")
           .set(CASE.ASSIGNED_TO, assignedTo) // Plain UUID
           .set(CASE.CREATED_AT, now)
           .set(CASE.UPDATED_AT, now)
           .set(CASE.SCHEMA_VERSION, 1)
           .set(CASE.CORRELATION_ID, correlationId)
           .execute();

        // 2. Insert Outbox Event
        Map<String, Object> payload = Map.of(
            "id", id.toString(),
            "tenant_id", tenantId.toString(),
            "title", title,
            "status", "OPEN"
        );
        String payloadJson = objectMapper.writeValueAsString(payload);

        dsl.insertInto(OUTBOX)
           .set(OUTBOX.ID, UUID.randomUUID())
           .set(OUTBOX.AGGREGATE_ID, id)
           .set(OUTBOX.EVENT_TYPE, "CASE_CREATED")
           .set(OUTBOX.PAYLOAD, org.jooq.JSONB.valueOf(payloadJson))
           .set(OUTBOX.TENANT_ID, tenantId)
           .set(OUTBOX.OCCURRED_AT, now)
           .set(OUTBOX.CORRELATION_ID, correlationId)
           .execute();
    }
}
