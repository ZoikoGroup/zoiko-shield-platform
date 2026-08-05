package com.zoiko.shieldcore.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static com.zoiko.shieldcore.jooq.tenant.Tables.TENANT_;
import static com.zoiko.shieldcore.jooq.tenant.Tables.OUTBOX;

@Service
public class TenantService {

    private final DSLContext dsl;
    private final ObjectMapper objectMapper;

    public TenantService(DSLContext dsl, ObjectMapper objectMapper) {
        this.dsl = dsl;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void createTenant(UUID tenantId, String name) throws Exception {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        UUID correlationId = UUID.randomUUID(); // Simulated correlation ID

        // 1. Insert Business Row
        dsl.insertInto(TENANT_)
           .set(TENANT_.ID, id)
           .set(TENANT_.TENANT_ID, tenantId)
           .set(TENANT_.NAME, name)
           .set(TENANT_.CREATED_AT, now)
           .set(TENANT_.UPDATED_AT, now)
           .set(TENANT_.STATUS, "ACTIVE")
           .set(TENANT_.SCHEMA_VERSION, 1)
           .set(TENANT_.CORRELATION_ID, correlationId)
           .execute();

        // 2. Insert Outbox Event (same transaction)
        Map<String, Object> payload = Map.of(
            "id", id.toString(),
            "tenant_id", tenantId.toString(),
            "name", name
        );
        String payloadJson = objectMapper.writeValueAsString(payload);

        dsl.insertInto(OUTBOX)
           .set(OUTBOX.ID, UUID.randomUUID())
           .set(OUTBOX.AGGREGATE_ID, id)
           .set(OUTBOX.EVENT_TYPE, "TENANT_CREATED")
           .set(OUTBOX.PAYLOAD, org.jooq.JSONB.valueOf(payloadJson))
           .set(OUTBOX.TENANT_ID, tenantId)
           .set(OUTBOX.OCCURRED_AT, now)
           .set(OUTBOX.CORRELATION_ID, correlationId)
           .execute();
    }

    @Transactional(readOnly = true)
    public Object getTenant(UUID id) {
        return dsl.selectFrom(TENANT_)
                  .where(TENANT_.ID.eq(id))
                  .and(TENANT_.STATUS.notEqual("DELETED"))
                  .fetchOne();
    }
    
    @Transactional
    public void softDeleteTenant(UUID id) {
        dsl.update(TENANT_)
           .set(TENANT_.STATUS, "DELETED")
           .set(TENANT_.DELETED_AT, OffsetDateTime.now())
           .where(TENANT_.ID.eq(id))
           .execute();
           
        // In a full implementation, you would emit a TENANT_DELETED outbox event here as well
    }
}
