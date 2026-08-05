package com.zoiko.shieldcore.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog")
public class CatalogController {

    @GetMapping
    public String getStatus() {
        return "catalog API is running";
    }
}
