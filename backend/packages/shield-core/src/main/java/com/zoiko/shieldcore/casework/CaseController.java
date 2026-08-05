package com.zoiko.shieldcore.casework;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/cases")
public class CaseController {

    private final CaseService caseService;

    public CaseController(CaseService caseService) {
        this.caseService = caseService;
    }

    // TODO: replace with real Cedar policy evaluation (Ticket #AUTH-123)
    private void checkAuthorization() {
    }

    @GetMapping
    public ResponseEntity<?> listCases(@RequestParam(required = false) String cursor, @RequestParam(defaultValue = "10") int limit) {
        checkAuthorization();
        return ResponseEntity.ok(Map.of(
            "data", java.util.List.of(),
            "next_cursor", "example-cursor"
        ));
    }

    @PostMapping
    public ResponseEntity<?> createCase(@RequestBody Map<String, Object> body) {
        checkAuthorization();
        try {
            UUID tenantId = UUID.fromString(body.get("tenant_id").toString());
            String title = body.get("title").toString();
            String description = body.getOrDefault("description", "").toString();
            String severity = body.get("severity").toString();
            
            UUID assignedTo = null;
            if (body.containsKey("assigned_to")) {
                assignedTo = UUID.fromString(body.get("assigned_to").toString());
            }

            caseService.createCase(tenantId, title, description, severity, assignedTo);
            return ResponseEntity.status(HttpStatus.CREATED).build();
        } catch (Exception e) {
            return buildErrorResponse("CREATE_FAILED", e.getMessage(), UUID.randomUUID(), false);
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
