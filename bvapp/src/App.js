import React, { useState } from "react";
import Plot from "react-plotly.js";
import { BounceLoader } from "react-spinners";
import sp500Json from "./sp500_tickers.json";
import GeoChart from "./map.js";
import { Tooltip } from "react-tooltip";

const industries = [
  ...new Set(
    Object.entries(sp500Json).map(([ticker, info]) => info["GICS Sector"])
  ),
];

const timePeriods = [
  "1 day",
  "5 days",
  "1 month",
  "3 months",
  "6 months",
  "1 year",
  "2 years",
  "5 years",
  "10 years",
  "Year to date",
  "All time",
];

function App() {
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [timePeriod, setTimePeriod] = useState("");
  const [stockData, setStockData] = useState(null);
  const [stockValuation, setStockValuation] = useState(null);
  const [stockDataPlot, setStockDataPlot] = useState(null);
  const [forecastPlot, setForecastPlot] = useState(null);
  const [companyPlot, setCompanyPlot] = useState(null);
  const [industryPEPlot, setIndustryPEPlot] = useState(null);
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(false);
  const orderedKeys = [
    "Company Summary",
    "Address",
    "Full-time Employees",
    "Audit Risk",
    "Board Risk",
    "Compensation Risk",
    "Shareholder Rights Risk",
    "Overall Risk",
  ];

  const getTooltipForKey = (key) => {
    switch (key) {
      case "Current Price":
        return "The current trading price of a single share of the company's stock.";
      case "EBITDA":
        return "Earnings Before Interest, Taxes, Depreciation, and Amortization - a measure of a company's overall financial performance.";
      case "EPS":
        return "Earnings Per Share - the portion of a company's profit allocated to each outstanding share of common stock.";
      case "End Cash Position":
        return "The amount of cash the company has on hand at the end of a reporting period.";
      case "Gross Profit":
        return "Revenue minus the cost of goods sold.";
      case "High":
        return "The highest price at which a security traded during a period.";
      case "Low":
        return "The lowest price at which a security traded during a period.";
      case "Market Cap":
        return "Market Capitalization - the total value of all a company's outstanding shares.";
      case "P/E Ratio":
        return "Price-to-Earnings Ratio - the ratio of the market price per share to earnings per share.";
      case "Pre-tax Income":
        return "A company's income after deducting expenses but before accounting for income tax.";
      case "Total Assets":
        return "The sum of all assets owned by a company.";
      case "Total Liabilities":
        return "The sum of all a company's debts and obligations.";
      case "Enterprise Value":
        return "The total value of a company, including both its equity and debt. It represents the theoretical takeover price.";
      case "Net Debt":
        return "A company's total debt minus any cash and cash equivalents it has on hand.";
      case "Equity Value":
        return 'The value of the company available to its shareholders (total assets minus total liabilities). Often referred to as "market cap" for publicly traded companies.';
      case "Audited Risk":
        return "This assesses the quality of the company’s financial reporting and internal controls, focusing on whether audits are conducted thoroughly and transparently.";
      case "Board Risk":
        return "This evaluates the structure and effectiveness of the board of directors, including its independence, diversity, and oversight.";
      case "Shareholder Rights Risk":
        return "This examines how well the company protects and upholds shareholder rights, such as voting rights and the ability to influence key decisions.";
      case "Compensation Risk":
        return "This focuses on executive compensation practices, looking at whether pay is aligned with performance and if there are excessive or unfair compensation packages.";
      case "Overall Risk":
        return "Overall governance risk is a key factor that affects a company’s reputation, operational efficiency, financial performance, and attractiveness to stakeholders.";
      default:
        return ``;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    try {
      const response = await fetch("/api/stock-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!response.ok) {
        throw new Error("Error fetching stock data");
      }

      const data = await response.json();

      setStockData(data);
      setCompanyPlot(JSON.parse(data["monetary_plot"]));
      setForecastPlot(JSON.parse(data["forecast_plot"]));
      setIndustryPEPlot(JSON.parse(data["industry_plot"]));
      setStockDataPlot(JSON.parse(data["plot"]));

      const newsResponse = await fetch("/api/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!newsResponse.ok) {
        throw new Error("Error fetching stock data");
      }

      const newsData = await newsResponse.json();
      setNews(newsData);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }

    try {
      const response = await fetch("/api/stock-valuation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ company }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch stock valuation");
      }

      const data = await response.json();
      setStockValuation(data);
    } catch (error) {
      setStockValuation(null);
      console.error("Error fetching stock valuation:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.app}>
      <h1 style={styles.header}>Stock Data Viewer</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label
            style={styles.label}
            data-tip="Choose a company from the selected industry."
          >
            Industry:
          </label>
          <select
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setCompany("");
              setStockData(null);
              setNews(null);
            }}
            style={styles.select}
          >
            <option value="">Select Industry</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Company:</label>
          <select
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setStockData(null);
              setNews(null);
            }}
            disabled={!industry}
            style={styles.select}
          >
            <option value="">Select Company</option>
            {Object.entries(sp500Json)
              .filter(([ticker, data]) => data["GICS Sector"] === industry)
              .map(([ticker, data]) => (
                <option key={ticker} value={ticker}>
                  {data["Security"]}
                </option>
              ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Time Period:</label>
          <select
            value={timePeriod}
            onChange={(e) => {
              setTimePeriod(e.target.value);
              setStockData(null);
              setNews(null);
            }}
            style={styles.select}
          >
            <option value="">Select Time Period</option>
            {timePeriods.map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={timePeriod === "" || industry === "" || company === ""}
          style={
            timePeriod === "" || industry === "" || company === ""
              ? styles.buttonDisabled
              : styles.button
          }
        >
          Get Data
        </button>
      </form>

      {loading && (
        <div style={styles.loader}>
          <BounceLoader color="#007bff" loading={loading} size={50} />
        </div>
      )}

      <div style={styles.contentContainer}>
        <div style={styles.column}>
          {stockData && (
            <div style={styles.resultContainer}>
              <h2 style={styles.resultHeader}>{stockData.company} Overview</h2>
              <div style={styles.resultColumns}>
                <div style={styles.resultColumn}>
                  <div style={styles.plotsContainer}>
                    <div style={styles.plotWrapper}>
                      {timePeriod !== "1 day" && (
                        <>
                          <Plot
                            data={stockDataPlot.data}
                            layout={stockDataPlot.layout}
                            style={styles.plot}
                          />
                          <Plot
                            data={forecastPlot.data}
                            layout={forecastPlot.layout}
                            style={styles.plot}
                          />
                        </>
                      )}
                      <Plot
                        data={industryPEPlot.data}
                        layout={industryPEPlot.layout}
                        style={styles.plot}
                      />
                      <Plot
                        data={companyPlot.data}
                        layout={companyPlot.layout}
                        style={styles.plot}
                      />
                    </div>
                  </div>
                </div>
                <div style={styles.resultColumn}>
                  <div style={styles.infoContainer}>
                    <h3 style={styles.infoHeader}>Company Info</h3>
                    {stockData["info"]["Company Logo"] && (
                      <div style={styles.logoContainer}>
                        <img
                          src={stockData["info"]["Company Logo"]}
                          alt="Company Logo"
                          style={styles.logo}
                        />
                      </div>
                    )}
                    <ul style={styles.list}>
                      {orderedKeys.map(
                        (key) =>
                          stockData.info[key] !== undefined && (
                            <li key={key} style={styles.listItem}>
                              {key}: {stockData.info[key]}
                            </li>
                          )
                      )}
                    </ul>
                    <GeoChart
                      state={
                        stockData.info["Address"]
                          .split(",")[2]
                          .trim()
                          .split(" ")
                          .slice(-2, -1)[0]
                      }
                    />
                  </div>

                  <div style={styles.infoContainer}>
                    <h3 style={styles.infoHeader}>Summary Data</h3>
                    <ul style={styles.list}>
                      {Object.entries(stockData.summary_data).map(
                        ([key, value]) => (
                          <li
                            key={key}
                            style={styles.listItem}
                            data-tooltip-id="tooltip" // Link this element to the Tooltip component
                            data-tooltip-content={getTooltipForKey(key)}
                          >
                            {key}: {value}
                          </li>
                        )
                      )}
                      <Tooltip
                        id="tooltip"
                        place="left"
                        type="dark"
                        effect="solid"
                        style={{
                          padding: "8px 12px", // Adds padding to the tooltip
                          borderRadius: "4px", // Rounded corners
                          fontSize: "12px", // Small font size
                          maxWidth: "200px", // Max width to keep it box-like
                          whiteSpace: "normal", // Allows the text to wrap inside the box
                          textAlign: "center", // Center the text in the tooltip
                          wordWrap: "break-word", // Ensures long words break correctly
                        }}
                      />
                    </ul>
                  </div>

                  {stockValuation && (
                    <div style={styles.infoContainer}>
                      <h3 style={styles.infoHeader}>Valuation Details</h3>
                      <ul style={styles.list}>
                        <li style={styles.listItem}>
                          Company Name: {stockValuation["Company Name"]}
                        </li>
                        <li style={styles.listItem}>
                          Sector: {stockValuation.Sector}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey(
                            "Enterprise Value"
                          )}
                        >
                          Enterprise Value (Millions):{" "}
                          {stockValuation["Enterprise Value (Millions)"]}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey("Net Debt")}
                        >
                          Net Debt (Millions):{" "}
                          {stockValuation["Net Debt (Millions)"]}
                        </li>
                        <li
                          style={styles.listItem}
                          data-tooltip-id="tooltip"
                          data-tooltip-content={getTooltipForKey(
                            "Equity Value"
                          )}
                        >
                          Equity Value (Millions):{" "}
                          {stockValuation["Equity Value (Millions)"]}
                        </li>
                        <Tooltip
                          id="tooltip"
                          place="left"
                          type="dark"
                          effect="solid"
                          style={{
                            padding: "8px 12px", // Adds padding to the tooltip
                            borderRadius: "4px", // Rounded corners
                            fontSize: "12px", // Small font size
                            maxWidth: "200px", // Max width to keep it box-like
                            whiteSpace: "normal", // Allows the text to wrap inside the box
                            textAlign: "center", // Center the text in the tooltip
                            wordWrap: "break-word", // Ensures long words break correctly
                          }}
                        />
                      </ul>
                    </div>
                  )}

                  <div style={styles.column}>
                    {news && (
                      <div style={styles.newsContainer}>
                        <div style={styles.newsSentimentOverview}>
                          <h2 style={styles.newsHeader}>
                            News Sentiment Overview
                          </h2>
                          <p style={styles.newsSentimentText}>
                            <span style={styles.newsSentimentLabel}>
                              Sentiment Score:
                            </span>
                            <span style={styles.newsSentimentValue}>
                              {news.average_sentiment_score}
                            </span>
                          </p>
                          <p style={styles.newsSentimentText}>
                            <span style={styles.newsSentimentLabel}>
                              Sentiment Category:
                            </span>
                            <span style={styles.newsSentimentValue}>
                              {news.avg_sentiment_category}
                            </span>
                          </p>
                        </div>

                        {Object.keys(news.top_news).map((key) => (
                          <div key={key} style={styles.newsItem}>
                            <h3 style={styles.newsTitle}>
                              {news.top_news[key].title}
                            </h3>
                            <p style={styles.newsText}>
                              {news.top_news[key].text}
                            </p>
                            <a
                              href={news.top_news[key].news_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={styles.newsLink}
                            >
                              Read more &rarr;
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    fontFamily: "Arial, sans-serif",
    margin: "0 auto",
    padding: "20px",
    maxWidth: "100%",
  },
  header: {
    color: "#333",
    marginBottom: "20px",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "20px",
  },
  formGroup: {
    marginBottom: "15px",
    width: "100%",
    maxWidth: "400px",
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontWeight: "bold",
  },
  select: {
    width: "100%",
    padding: "10px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    fontSize: "16px",
  },
  button: {
    margin: "0.5em",
    padding: "10px 20px",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#007bff",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    transition: "background-color 0.3s",
  },
  buttonDisabled: {
    margin: "0.5em",
    padding: "10px 20px",
    borderRadius: "4px",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    transition: "background-color 0.3s",
    backgroundColor: "#ccc",
    cursor: "not-allowed",
  },
  contentContainer: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  column: {
    flex: "0 0 48%",
    marginBottom: "20px",
  },
  newsContainer: {
    marginBottom: "20px",
  },
  newsSentimentOverview: {
    backgroundColor: "#f0f8ff",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  newsHeader: {
    fontSize: "20px",
    marginBottom: "10px",
    color: "#333",
  },
  newsSentimentText: {
    fontSize: "16px",
    margin: "5px 0",
  },
  newsSentimentLabel: {
    fontWeight: "bold",
    marginRight: "10px",
  },
  newsSentimentValue: {
    color: "#007bff",
  },
  newsItem: {
    backgroundColor: "#fff",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "15px",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  },
  newsTitle: {
    fontSize: "18px",
    marginBottom: "10px",
    color: "#333",
  },
  newsText: {
    fontSize: "14px",
    lineHeight: "1.6",
    color: "#555",
  },
  newsLink: {
    display: "inline-block",
    marginTop: "10px",
    color: "#007bff",
    textDecoration: "none",
  },
  resultContainer: {
    marginBottom: "20px",
  },
  resultHeader: {
    marginBottom: "10px",
    fontSize: "20px",
    fontWeight: "bold",
  },
  resultColumns: {
    display: "flex",
    justifyContent: "space-between",
  },
  resultColumn: {
    flex: "0 0 48%",
  },
  plotsContainer: {
    whiteSpace: "nowrap",
  },
  plotWrapper: {
    display: "inline-block",
  },
  plot: {
    marginBottom: "20px",
  },
  infoContainer: {
    marginTop: "15px",
    padding: "15px",
    borderRadius: "8px",
    backgroundColor: "#f0f8ff",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  infoHeader: {
    marginBottom: "10px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#007bff",
  },
  list: {
    listStyleType: "none",
    padding: "0",
  },
  listItem: {
    marginBottom: "8px",
    fontSize: "16px",
  },
  loader: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    zIndex: 1000,
  },
};

export default App;
