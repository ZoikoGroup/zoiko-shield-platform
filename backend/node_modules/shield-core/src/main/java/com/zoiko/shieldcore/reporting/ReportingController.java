package com.zoiko.shieldcore.reporting;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reporting")
public class ReportingController {

    @GetMapping
    public String getStatus() {
        return "reporting API is running";
    }
}
