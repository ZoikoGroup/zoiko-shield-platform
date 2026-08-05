package com.zoiko.shieldcore.tenant;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/tenants")
public class TenantController {

    private final TenantService tenantService;

    public TenantController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    // TODO: replace with real Cedar policy evaluation (Ticket #AUTH-123)
    private void checkAuthorization() {
        // Mock authorization hook
    }

    @GetMapping
    public ResponseEntity<?> listTenants(@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "10") int limit) {
        checkAuthorization();
        // Return cursor-based pagination
        return ResponseEntity.ok(Map.of(
            "data", java.util.List.of(),
            "next_cursor", "example-cursor-string"
        ));
    }

    @PostMapping
    public ResponseEntity<?> createTenant(@RequestBody Map<String, Object> body) {
        checkAuthorization();
        try {
            UUID tenantId = UUID.fromString(body.get("tenant_id").toString());
            String name = body.get("name").toString();
            tenantService.createTenant(tenantId, name);
            return ResponseEntity.status(HttpStatus.CREATED).build();
        } catch (Exception e) {
            return buildErrorResponse("CREATE_FAILED", e.getMessage(), UUID.randomUUID(), false);
        }
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTenant(@PathVariable UUID id) {
        checkAuthorization();
        try {
            tenantService.softDeleteTenant(id);
            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            return buildErrorResponse("DELETE_FAILED", e.getMessage(), UUID.randomUUID(), false);
        }
    }

    private ResponseEntity<?> buildErrorResponse(String errorCode, String message, UUID correlationId, boolean retryable) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
            "error_code", errorCode,
            "message", message,
            "correlation_id", correlationId.toString(),
            "retryable", retryable
        ));
    }
}
