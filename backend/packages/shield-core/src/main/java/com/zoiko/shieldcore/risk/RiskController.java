package com.zoiko.shieldcore.risk;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/risk")
public class RiskController {

    @GetMapping
    public String getStatus() {
        return "risk API is running";
    }
}
