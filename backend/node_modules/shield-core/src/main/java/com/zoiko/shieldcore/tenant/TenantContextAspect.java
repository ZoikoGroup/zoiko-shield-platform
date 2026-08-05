package com.zoiko.shieldcore.tenant;

import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.jooq.DSLContext;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import jakarta.servlet.http.HttpServletRequest;

@Aspect
@Component
public class TenantContextAspect {

    private final DSLContext dslContext;

    public TenantContextAspect(DSLContext dslContext) {
        this.dslContext = dslContext;
    }

    @Before("@annotation(org.springframework.transaction.annotation.Transactional)")
    public void setTenantContext() {
        // Mocking the resolution of tenant_id from the authenticated actor context
        // In reality, this comes from a SecurityContextHolder (Spring Security)
        
        HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
        String tenantIdStr = request.getHeader("X-Mock-Tenant-Id");
        String role = request.getHeader("X-Mock-Role");
        
        if (tenantIdStr == null) {
            tenantIdStr = "00000000-0000-0000-0000-000000000000"; // default mock UUID
        }
        if (role == null) {
            role = "user";
        }

        // Execute SET LOCAL within the transaction to enforce RLS
        dslContext.execute("SET LOCAL app.current_tenant_id = '" + tenantIdStr + "'");
        dslContext.execute("SET LOCAL app.current_role = '" + role + "'");
    }
}
