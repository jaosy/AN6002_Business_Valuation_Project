from flask import Flask, jsonify, request
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import plotly as plotly
import requests
import yfinance as yf
import pandas as pd
import numpy as np
import json


app = Flask(__name__)


# Load the JSON data from the file
with open("./sp500_tickers.json", "r") as file:
    sp500Json = json.load(file)


valid_time_periods = {
    "1 day": "1d",
    "5 days": "5d",
    "1 month": "1mo",
    "3 months": "3mo",
    "6 months": "6mo",
    "1 year": "1y",
    "2 years": "2y",
    "5 years": "5y",
    "10 years": "10y",
    "Year to date": "ytd",
    "All time": "max",
}


@app.route("/api/sp500_tickers", methods=["GET"])
def get_sp500_tickers():
    # Fetch S&P 500 constituents from Wikipedia
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    tables = pd.read_html(url)
    df = tables[0]  # The first table contains the S&P 500 data
    df = df[["Symbol", "GICS Sector", "Security"]]  # Select relevant columns
    tickers_data = df.set_index("Symbol")[["GICS Sector", "Security"]].to_dict(
        orient="index"
    )  # Create a dictionary of tickers, sectors, and company names
    return jsonify(tickers_data)


@app.route("/api/stock-data", methods=["POST"])
def get_stock_data():
    data = request.json
    ticker = data.get("company")

    company_name = sp500Json[ticker]["Security"]

    time_period = valid_time_periods[data.get("time_period")]

    # Fetch stock data
    stock_data = yf.Ticker(ticker).history(period=time_period)

    # Generate plots
    plotJSON = generate_timeseries_plot(stock_data, company_name)

    # Get company basic info
    info = get_company_basic_info(ticker)

    # Get company summary metrics
    summary_data = get_company_summary(ticker, company_name, time_period)

    return jsonify(
        {
            "company": company_name,
            "info": info,
            "ticker_symbol": ticker,
            "plot": plotJSON,  # Return the HTML content
            "summary_data": summary_data,
        }
    )


@app.route("/api/stock-valuation", methods=["POST"])
def stock_valuation():
    data = request.json
    company = data.get("company")  # Get the company name from the request

    if not company:
        return jsonify({"error": "Company name is required."}), 400

    # Get the ticker symbol using the get_ticker function
    ticker_input = get_ticker(company)
    ticker = ticker_input.upper()

    stock = yf.Ticker(ticker)
    info = stock.info

    income_stmt = stock.financials
    cash_flow = stock.cashflow
    balance_sheet = stock.balance_sheet

    if income_stmt.empty or cash_flow.empty or balance_sheet.empty:
        return jsonify({"error": "Financial data not available for this ticker."}), 400

    sector = info.get("sector", "Unknown")
    company = info.get("shortName", "Unknown")

    possible_operating_cf_keys = [
        "Total Cash From Operating Activities",
        "Net Cash Provided by Operating Activities",
        "Operating Cash Flow",
        "Cash from Operating Activities",
    ]

    possible_capex_keys = [
        "Capital Expenditures",
        "Investment in Property, Plant and Equipment",
        "Purchases of Property and Equipment",
        "Capital Expenditure",
    ]

    def get_cash_flow_item(cash_flow_df, possible_keys):
        for key in possible_keys:
            if key in cash_flow_df.index:
                return cash_flow_df.loc[key]
        return None

    operating_cf = get_cash_flow_item(cash_flow, possible_operating_cf_keys)
    capex = get_cash_flow_item(cash_flow, possible_capex_keys)

    if operating_cf is None or capex is None:
        return (
            jsonify(
                {"error": "Necessary financial data not found in cash flow statement."}
            ),
            400,
        )

    # Get EBITDA
    try:
        ebitda_series = income_stmt.loc["EBITDA"]
        ebitda_series = ebitda_series.sort_index(ascending=True)
        ebitda_values = ebitda_series.values
    except KeyError:
        return (
            jsonify({"error": "EBITDA data not available."}),
            400,
        )  # Exit the function

    # Check for zero or negative EBITDA
    if ebitda_values[-1] <= 0 or np.isnan(ebitda_values[-1]):
        return (
            jsonify({"error": "EBITDA data is invalid or non-positive."}),
            400,
        )

    fcf = operating_cf - capex
    fcf = fcf.sort_index(ascending=True)
    fcf_values = fcf.values
    years = fcf.index

    if len(fcf_values) < 2:
        return jsonify({"error": "Not enough data to perform DCF."}), 400

    # Calculate historical EBITDA growth rates
    growth_rates = []
    for i in range(1, len(ebitda_values)):
        if ebitda_values[i - 1] != 0:
            growth = (ebitda_values[i] - ebitda_values[i - 1]) / abs(
                ebitda_values[i - 1]
            )
            growth_rates.append(growth)

    if len(growth_rates) > 0:
        avg_growth_rate = np.mean(growth_rates)
        if np.isnan(avg_growth_rate) or np.isinf(avg_growth_rate):
            avg_growth_rate = 0.05  # Default to 5% if invalid
    else:
        avg_growth_rate = 0.05  # Assume 5% growth rate if data insufficient

    # Calculate WACC
    # Cost of Equity using CAPM
    beta = info.get("beta", 1.0)
    if beta is None or np.isnan(beta):
        beta = 1.0  # Default beta
    risk_free_rate = 0.02  # 2% risk-free rate
    market_return = 0.08  # 8% expected market return
    cost_of_equity = risk_free_rate + beta * (market_return - risk_free_rate)

    # Ensure cost_of_equity is valid
    if np.isnan(cost_of_equity) or cost_of_equity <= 0:
        cost_of_equity = 0.08  # Default to 8%

    # Cost of Debt
    try:
        total_debt = (
            balance_sheet.loc["Short Long Term Debt"].iloc[0]
            + balance_sheet.loc["Long Term Debt"].iloc[0]
        )
    except KeyError:
        total_debt = balance_sheet.loc["Long Term Debt"].iloc[0]
    try:
        interest_expense = income_stmt.loc["Interest Expense"].iloc[0]
    except KeyError:
        interest_expense = 0

    if total_debt > 0:
        cost_of_debt = abs(interest_expense) / total_debt
    else:
        cost_of_debt = 0

    # Tax Rate
    try:
        income_before_tax = income_stmt.loc["Income Before Tax"].iloc[0]
        income_tax_expense = income_stmt.loc["Income Tax Expense"].iloc[0]
        tax_rate = income_tax_expense / income_before_tax
    except KeyError:
        tax_rate = 0.21  # Assume 21% tax rate if data not available

    # Capital Structure
    market_cap = info.get("marketCap", 0)
    total_value = market_cap + total_debt
    if total_value == 0:
        return (
            jsonify(
                {"error": "Market capitalization or total debt data not available."}
            ),
            400,
        )

    weight_of_equity = market_cap / total_value
    weight_of_debt = total_debt / total_value

    # WACC Calculation

    WACC = (weight_of_equity * cost_of_equity) + (
        weight_of_debt * cost_of_debt * (1 - tax_rate)
    )
    if np.isnan(WACC) or WACC <= 0:
        return (
            jsonify({"error": "MACC Calculation invalid"}),
            400,
        )

    # Ensure WACC is greater than terminal growth rate
    terminal_growth_rate = 0.025
    if WACC <= terminal_growth_rate:
        print("WACC is less than or equal to terminal growth rate. Adjusting WACC.")
        WACC = (
            terminal_growth_rate + 0.01
        )  # Set WACC slightly above terminal growth rate

    # Project FCF into the future
    forecast_years = 5
    forecast_fcf = []
    last_fcf = fcf_values[-1]
    forecast_ebitda = []
    last_ebitda = ebitda_values[-1]

    for i in range(1, forecast_years + 1):
        projected_ebitda = last_ebitda * ((1 + avg_growth_rate) ** i)
        forecast_ebitda.append(projected_ebitda)

    for i in range(1, forecast_years + 1):
        projected_fcf = last_fcf * ((1 + avg_growth_rate) ** i)
        forecast_fcf.append(projected_fcf)

    # Discount forecasted FCF
    discounted_fcf = []
    for i in range(1, forecast_years + 1):
        pv = forecast_fcf[i - 1] / ((1 + WACC) ** i)
        discounted_fcf.append(pv)

    # Calculate terminal value
    terminal_growth_rate = 0.025
    terminal_value = (
        forecast_fcf[-1] * (1 + terminal_growth_rate) / (WACC - terminal_growth_rate)
    )
    terminal_value_pv = terminal_value / ((1 + WACC) ** forecast_years)

    # Assume constant D&A and calculate EBIT
    try:
        depreciation = income_stmt.loc["Depreciation"].iloc[0]
    except KeyError:
        depreciation = 0  # Assume zero if data not available

    forecast_ebit = [ebitda - depreciation for ebitda in forecast_ebitda]

    # Calculate NOPAT (Net Operating Profit After Tax)
    nopat = [ebit * (1 - tax_rate) for ebit in forecast_ebit]

    # Discount forecasted NOPAT
    discounted_cash_flows = []
    for i in range(1, forecast_years + 1):
        pv = nopat[i - 1] / ((1 + WACC) ** i)
        discounted_cash_flows.append(pv)

    # Calculate terminal value
    terminal_value = (
        nopat[-1] * (1 + terminal_growth_rate) / (WACC - terminal_growth_rate)
    )
    terminal_value_pv = terminal_value / ((1 + WACC) ** forecast_years)

    # Check for NaN or infinite terminal value
    if np.isnan(terminal_value_pv) or np.isinf(terminal_value_pv):
        print("Terminal value calculation invalid.")
        return

    # Enterprise Value
    enterprise_value = sum(discounted_cash_flows) + terminal_value_pv

    # Check for NaN or infinite enterprise value
    if np.isnan(enterprise_value) or np.isinf(enterprise_value):
        print("Enterprise value calculation invalid.")
        return

    # Get Cash and Cash Equivalents
    try:
        cash_and_equiv = (
            balance_sheet.loc["Cash"].iloc[0]
            + balance_sheet.loc["Short Term Investments"].iloc[0]
        )
    except KeyError:
        try:
            cash_and_equiv = balance_sheet.loc["Cash"].iloc[0]
        except KeyError:
            cash_and_equiv = 0  # If cash data not available

    # Calculate Net Debt
    net_debt = total_debt - cash_and_equiv

    # Calculate Equity Value
    equity_value = enterprise_value - net_debt

    # Convert values to millions
    enterprise_value_millions = enterprise_value / 1e6
    net_debt_millions = net_debt / 1e6
    equity_value_millions = equity_value / 1e6

    # DCF value
    dcf_value = sum(discounted_fcf) + terminal_value_pv

    # Get shares outstanding
    shares_outstanding = info.get("sharesOutstanding", 0)

    if shares_outstanding == 0:
        return jsonify({"error": "Shares outstanding not available."}), 400

    intrinsic_value_per_share = dcf_value / shares_outstanding

    # Convert values to millions
    enterprise_value_millions = enterprise_value / 1e6
    net_debt_millions = net_debt / 1e6
    equity_value_millions = equity_value / 1e6

    # Prepare output
    data = {
        "Ticker": ticker,
        "Company Name": company,
        "Sector": sector,
        "Enterprise Value (Millions)": f"$ {enterprise_value_millions:.2f} mil",
        "Net Debt (Millions)": f"$ {net_debt_millions:.2f} mil",
        "Equity Value (Millions)": f" $ {equity_value_millions:.2f} mil",
        "Intrinsic Value per Share": f" $ {intrinsic_value_per_share:.2f}",
    }

    return jsonify(data)


def get_ticker(company_name):
    yfinance = "https://query2.finance.yahoo.com/v1/finance/search"
    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
    params = {"q": company_name, "quotes_count": 1, "country": "United States"}

    res = requests.get(url=yfinance, params=params, headers={"User-Agent": user_agent})
    data = res.json()

    company_code = data["quotes"][0]["symbol"]
    return company_code


# def get_company_logo(company_domain):
#     # Using Clearbit's logo API to get the company logo
#     logo_url = f"https://logo.clearbit.com/{company_domain}"

#     try:
#         response = requests.get(logo_url)
#         response.raise_for_status()

#         # Open the image and display it
#         img = Image.open(BytesIO(response.content))
#         img.show()
#         return img
#     except Exception as e:
#         print(f"Could not retrieve logo for {company_domain}: {e}")
#         return None


def get_company_basic_info(ticker):
    stock = yf.Ticker(ticker)

    # Retrieve company info from Yahoo Finance
    info = stock.info

    # Extract full address information
    address1 = info.get("address1", "N/A")
    address2 = info.get("address2", "")
    city = info.get("city", "")
    state = info.get("state", "")
    zip_code = info.get("zip", "")
    country = info.get("country", "N/A")

    # Format full address
    full_address = (
        f"{address1}, {address2} {city}, {state} {zip_code}, {country}".strip(", ")
    )

    # Extract additional company information
    full_time_employees = info.get("fullTimeEmployees", "N/A")
    company_summary = info.get("longBusinessSummary", "N/A")

    # Retrieve governance risk information
    audit_risk = info.get("auditRisk", "N/A")
    board_risk = info.get("boardRisk", "N/A")
    compensation_risk = info.get("compensationRisk", "N/A")
    shareholder_rights_risk = info.get("shareHolderRightsRisk", "N/A")
    overall_risk = info.get("overallRisk", "N/A")

    info_dict = {
        "Company Summary": company_summary,
        "Address": full_address,
        "Full-time Employees": full_time_employees,
        "Audit Risk": audit_risk,
        "Board Risk": board_risk,
        "Compensation Risk": compensation_risk,
        "Shareholder Rights Risk": shareholder_rights_risk,
        "Overall Risk": overall_risk,
    }

    return info_dict


def generate_timeseries_plot(df, chosen_company):
    # Create a Plotly figure
    fig = go.Figure()

    # Add the closing price line
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["Close"],
            mode="lines",
            name="Price",
            line=dict(color="green", width=2),
            hoverinfo="text",
            hovertext=df["Close"].apply(lambda x: f"Price: ${x:.2f}"),
        )
    )

    # Find max and min values
    max_value = df["Close"].max()
    max_date = df["Close"].idxmax()
    min_value = df["Close"].min()
    min_date = df["Close"].idxmin()

    # Add markers for max and min points with adjusted text position
    fig.add_trace(
        go.Scatter(
            x=[max_date],
            y=[max_value],
            mode="markers+text",
            name="Max Price",
            marker=dict(color="blue", size=10),
            text=[f"Max: ${max_value:.2f}<br>Date: {max_date.date()}"],
            textposition="middle right",  # Adjusted position
        )
    )

    fig.add_trace(
        go.Scatter(
            x=[min_date],
            y=[min_value],
            mode="markers+text",
            name="Min Price",
            marker=dict(color="red", size=10),
            text=[f"Min: ${min_value:.2f}<br>Date: {min_date.date()}"],
            textposition="middle right",  # Adjusted position
        )
    )

    # Update layout with padding
    fig.update_layout(
        title=f"Stock Price for {chosen_company}",
        xaxis_title="Date",
        yaxis_title="Price (US$)",
        legend_title="Legend",
        hovermode="x unified",
        template="plotly_white",  # Use a clean white template
        margin=dict(l=40, r=40, t=40, b=40),  # Add margins to avoid cutting off text
    )
    fig.update_yaxes(automargin=True)
    fig.update_xaxes(automargin=True)

    graphJSON = plotly.io.to_json(fig, pretty=True)
    return graphJSON


def get_company_summary(ticker_symbol, choosen_company, time="1d"):
    """Fetch and return company summary information using yfinance."""
    company = yf.Ticker(ticker_symbol)
    stock_data = company.history(period=str(time))
    info = company.info

    # Create a summary dictionary
    summary = {
        "P/E Ratio": f'{info.get("trailingPE", "N/A"):.2f}',
        "High": (
            f'$ {stock_data["High"].iloc[-1]:.2f}' if not stock_data.empty else "N/A"
        ),
        "Low": f'$ {stock_data["Low"].iloc[-1]:.2f}' if not stock_data.empty else "N/A",
        "Current Price": (
            f'$ {stock_data["Close"].iloc[-1]:.2f}' if not stock_data.empty else "N/A"
        ),
        "Market Cap": f'$ {info.get("marketCap", "N/A")/ 1_000_000_000:.2f} mil',
        "EPS": f'$ {info.get("trailingEps", "N/A"):.2f}',
        "Gross Profit": (
            f'$ {company.financials.loc["Gross Profit"][0]/1_000_000_000:.2f} mil'
            if "Gross Profit" in company.financials.index
            else "N/A"
        ),
        "Pre-tax Income": (
            f'$ {company.financials.loc["Pretax Income"][0]/1_000_000_000:.2f} mil'
            if "Pretax Income" in company.financials.index
            else "N/A"
        ),
        "EBITDA": (
            f'$ {company.financials.loc["EBITDA"][0]/1_000_000_000:.2f} mil'
            if "EBITDA" in company.financials.index
            else "N/A"
        ),
        "Total Liabilities": (
            f'$ {company.balance_sheet.loc["Total Liabilities Net Minority Interest"][0]/1_000_000_000:.2f} mil'
            if "Total Liabilities Net Minority Interest" in company.balance_sheet.index
            else "N/A"
        ),
        "Total Assets": (
            f'$ {company.balance_sheet.loc["Total Assets"][0]/1_000_000_000:.2f} mil'
            if "Total Assets" in company.balance_sheet.index
            else "N/A"
        ),
        "End Cash Position": (
            f'$ {company.cashflow.loc["End Cash Position"][0]/1_000_000_000:.2f} mil'
            if "End Cash Position" in company.cashflow.index
            else "N/A"
        ),
    }

    print(summary)

    return summary


if __name__ == "__main__":
    app.run(debug=True)
